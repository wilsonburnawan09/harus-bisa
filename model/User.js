var mongoose = require('mongoose');  
var userSchema = new mongoose.Schema({  
  first_name: String,
  last_name:String,
  email: String,
  school: String,
  role: String,
  password: String,
  courses: []
});

module.exports = mongoose.model('User', userSchema);