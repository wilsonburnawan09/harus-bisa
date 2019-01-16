var app = require('./app');
var port = process.env.PORT || 3000;
var host ='http://ec2-18-206-115-15.compute-1.amazonaws.com/';

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World\n');
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});

// var server = app.listen(port, host, function() {
//   console.log('Express server listening on port ' + port);
// });