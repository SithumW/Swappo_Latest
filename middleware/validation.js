// middleware/validation.js
export function validateItemInput(req, res, next) {
  const { title, description, category, condition } = req.body;
  
  if (!title || title.trim().length < 3) {
    return res.status(400).json({ error: 'Title must be at least 3 characters' });
  }
  
  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: 'Description must be at least 10 characters' });
  }
  
  if (!category || !ITEM_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Valid category is required' });
  }
  
  if (!condition || !ITEM_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: 'Valid condition is required' });
  }
  
  next();
}

export function validateTradeRequest(req, res, next) {
  const { requested_item_id, offered_item_id } = req.body;
  
  if (!requested_item_id || !offered_item_id) {
    return res.status(400).json({ 
      error: 'Both requested and offered item IDs are required' 
    });
  }
  
  if (requested_item_id === offered_item_id) {
    return res.status(400).json({ 
      error: 'Cannot trade an item for itself' 
    });
  }
  
  next();
}