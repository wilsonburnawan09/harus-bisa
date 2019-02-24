var mongoose = require('mongoose');  
var userSchema = new mongoose.Schema({  
	first_name: String,
	last_name:String,
	email: { type: String, index: true},
	school: String,
	role: String,
	password: String,
	courses: [mongoose.Schema.Types.ObjectId]
});

module.exports = mongoose.model('User', userSchema);