// services/ratingService.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class RatingService {

  /**
   * Create a new rating
   */
  static async createRating(ratingData, raterId) {
    const { rated_id, trade_id, rating, review } = ratingData;

    // Validate user is not rating themselves
    if (raterId === rated_id) {
      throw new Error('You cannot rate yourself');
    }

    // If trade_id is provided, validate the trade and user's involvement
    if (trade_id) {
      const trade = await prisma.trade.findUnique({
        where: { id: trade_id },
        select: { 
          user1_id: true, 
          user2_id: true, 
          status: true,
          requested_item: {
            select: { user_id: true }
          },
          offered_item: {
            select: { user_id: true }
          }
        }
      });

      if (!trade) {
        throw new Error('Trade not found');
      }

      if (trade.status !== 'COMPLETED') {
        throw new Error('You can only rate users from completed trades');
      }

      // Validate the rater was part of the trade
      const isUserInTrade = trade.user1_id === raterId || trade.user2_id === raterId;
      if (!isUserInTrade) {
        throw new Error('You can only rate users from trades you participated in');
      }

      // Validate the rated user was part of the trade and is the other party
      const isRatedUserInTrade = trade.user1_id === rated_id || trade.user2_id === rated_id;
      if (!isRatedUserInTrade) {
        throw new Error('You can only rate the other party in the trade');
      }

      // Check if rating already exists for this trade
      const existingRating = await prisma.userRating.findFirst({
        where: {
          rater_id: raterId,
          rated_id: rated_id,
          trade_id: trade_id
        }
      });

      if (existingRating) {
        throw new Error('You have already rated this user for this trade');
      }
    } else {
      // For general ratings (not trade-specific), check if user exists
      const ratedUser = await prisma.user.findUnique({
        where: { id: rated_id },
        select: { id: true }
      });

      if (!ratedUser) {
        throw new Error('User to be rated not found');
      }
    }

    // Create the rating
    const newRating = await prisma.userRating.create({
      data: {
        rater_id: raterId,
        rated_id,
        trade_id: trade_id || null,
        rating,
        review: review || null
      },
      include: {
        rater: {
          select: { id: true, name: true, image: true }
        },
        rated: {
          select: { id: true, name: true, image: true }
        },
        trade: trade_id ? {
          select: {
            id: true,
            requested_item: { select: { title: true } },
            offered_item: { select: { title: true } }
          }
        } : false
      }
    });

    return newRating;
  }

  /**
   * Update a rating
   */
  static async updateRating(ratingId, raterId, updateData) {
    const existingRating = await prisma.userRating.findUnique({
      where: { id: ratingId },
      select: { 
        rater_id: true,
        trade_id: true
      }
    });

    if (!existingRating) {
      throw new Error('Rating not found');
    }

    if (existingRating.rater_id !== raterId) {
      throw new Error('You can only update your own ratings');
    }

    // Optional: Add time limit for updates (e.g., 30 days)
    // const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // if (existingRating.created_at < thirtyDaysAgo) {
    //   throw new Error('Ratings can only be updated within 30 days of creation');
    // }

    const updatedRating = await prisma.userRating.update({
      where: { id: ratingId },
      data: updateData,
      include: {
        rater: {
          select: { id: true, name: true, image: true }
        },
        rated: {
          select: { id: true, name: true, image: true }
        },
        trade: existingRating.trade_id ? {
          select: {
            id: true,
            requested_item: { select: { title: true } },
            offered_item: { select: { title: true } }
          }
        } : false
      }
    });

    return updatedRating;
  }

  /**
   * Delete a rating
   */
  static async deleteRating(ratingId, raterId) {
    const existingRating = await prisma.userRating.findUnique({
      where: { id: ratingId },
      select: { rater_id: true }
    });

    if (!existingRating) {
      throw new Error('Rating not found');
    }

    if (existingRating.rater_id !== raterId) {
      throw new Error('You can only delete your own ratings');
    }

    await prisma.userRating.delete({
      where: { id: ratingId }
    });

    return { message: 'Rating deleted successfully' };
  }

  /**
   * Get ratings for a user (ratings they received)
   */
  static async getUserRatings(userId, type = 'received', pagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const whereClause = type === 'given' 
      ? { rater_id: userId }
      : { rated_id: userId };

    const [ratings, total, averageRating] = await Promise.all([
      prisma.userRating.findMany({
        where: whereClause,
        include: {
          rater: {
            select: { id: true, name: true, image: true }
          },
          rated: {
            select: { id: true, name: true, image: true }
          },
          trade: {
            select: {
              id: true,
              requested_item: { select: { title: true } },
              offered_item: { select: { title: true } }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.userRating.count({ where: whereClause }),
      prisma.userRating.aggregate({
        where: whereClause,
        _avg: { rating: true },
        _count: { rating: true }
      })
    ]);

    return {
      ratings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statistics: {
        averageRating: averageRating._avg.rating ? 
          Math.round(averageRating._avg.rating * 10) / 10 : 0,
        totalRatings: averageRating._count.rating
      }
    };
  }

  /**
   * Get rating statistics for a user
   */
  static async getUserRatingStats(userId) {
    const [receivedStats, givenStats, ratingDistribution] = await Promise.all([
      // Stats for ratings received
      prisma.userRating.aggregate({
        where: { rated_id: userId },
        _avg: { rating: true },
        _count: { rating: true },
        _min: { rating: true },
        _max: { rating: true }
      }),
      // Stats for ratings given
      prisma.userRating.aggregate({
        where: { rater_id: userId },
        _avg: { rating: true },
        _count: { rating: true }
      }),
      // Distribution of ratings received
      prisma.userRating.groupBy({
        by: ['rating'],
        where: { rated_id: userId },
        _count: { rating: true },
        orderBy: { rating: 'asc' }
      })
    ]);

    const distribution = Array.from({ length: 5 }, (_, i) => {
      const rating = i + 1;
      const found = ratingDistribution.find(d => d.rating === rating);
      return {
        rating,
        count: found ? found._count.rating : 0
      };
    });

    return {
      received: {
        average: receivedStats._avg.rating ? 
          Math.round(receivedStats._avg.rating * 10) / 10 : 0,
        total: receivedStats._count.rating,
        min: receivedStats._min.rating || 0,
        max: receivedStats._max.rating || 0,
        distribution
      },
      given: {
        average: givenStats._avg.rating ? 
          Math.round(givenStats._avg.rating * 10) / 10 : 0,
        total: givenStats._count.rating
      }
    };
  }

  /**
   * Get pending ratings (trades that can be rated)
   */
  static async getPendingRatings(userId, pagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Find completed trades where user hasn't rated the other party yet
    const [pendingRatings, total] = await Promise.all([
      prisma.trade.findMany({
        where: {
          AND: [
            { status: 'COMPLETED' },
            {
              OR: [
                { user1_id: userId },
                { user2_id: userId }
              ]
            },
            // No existing rating from this user for this trade
            {
              ratings: {
                none: {
                  rater_id: userId
                }
              }
            }
          ]
        },
        include: {
          user1: {
            select: { id: true, name: true, image: true }
          },
          user2: {
            select: { id: true, name: true, image: true }
          },
          requested_item: {
            select: { title: true, images: true }
          },
          offered_item: {
            select: { title: true, images: true }
          }
        },
        orderBy: { completed_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.trade.count({
        where: {
          AND: [
            { status: 'COMPLETED' },
            {
              OR: [
                { user1_id: userId },
                { user2_id: userId }
              ]
            },
            {
              ratings: {
                none: {
                  rater_id: userId
                }
              }
            }
          ]
        }
      })
    ]);

    // Format the response to include the user to be rated
    const formattedPendingRatings = pendingRatings.map(trade => {
      const otherUser = trade.user1_id === userId ? trade.user2 : trade.user1;
      return {
        trade: {
          id: trade.id,
          completed_at: trade.completed_at,
          requested_item: trade.requested_item,
          offered_item: trade.offered_item
        },
        userToRate: otherUser
      };
    });

    return {
      pendingRatings: formattedPendingRatings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}
