var mongoose = require('mongoose');
var config = require('./config');
mongoose.connect('mongodb+srv://wilsonburnawan:'+config.mongodb_password+'@cluster0-qxo9d.mongodb.net/main?retryWrites=true', {useNewUrlParser: true});