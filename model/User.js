var mongoose = require('mongoose');  
var userSchema = new mongoose.Schema({  
  first_name: String,
  last_name:String,
  email: { type: String, index: true},
  school: String,
  role: String,
  password: String,
  courses: []
});

module.exports = mongoose.model('User', userSchema);