var mongoose = require('mongoose');  
var tokenSchema = new mongoose.Schema({  
	email: { type: String, required: true, ref: 'User'},
    random_string: { type: String, required: true, index: true},
    expireAt: {
        type: Date,
        default: Date.now,
        index: { expires: '10m' },
      },
});

module.exports = mongoose.model('Token', tokenSchema);