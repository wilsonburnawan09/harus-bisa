var mongoose = require('mongoose');  
var counterSchema = new mongoose.Schema({  
	_id: String,
	value: Number
}, { collection: 'counters' });

module.exports = mongoose.model('Counter', counterSchema);