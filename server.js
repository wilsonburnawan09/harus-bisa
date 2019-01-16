var app = require('./app');
var port = process.env.PORT || 3000;
var host ='http://ec2-18-206-115-15.compute-1.amazonaws.com';

var server = app.listen(port, host, function() {
  console.log('Express server listening on port ' + port);
});