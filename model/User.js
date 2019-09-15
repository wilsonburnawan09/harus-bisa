var mongoose = require('mongoose');  
var userSchema = new mongoose.Schema({  
	first_name: String,
	last_name:String,
	email: { type: String, index: true},
	school: String,
	is_verified: {type: Boolean, default:false},
	role: String,
	password: String,
	password_reset_token: String,
	password_reset_expires: Date,
	courses: [mongoose.Schema.Types.ObjectId]
});

module.exports = mongoose.model('User', userSchema);