'use strict';

const compression = require('compression');
const express = require('express');
const path = require('path');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const proxy = require('http-proxy-middleware');

// Constants
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'app';
const USE_CAS = process.env.USE_CAS === 'false'
  ? false : true;
const USE_GZIP = process.env.USE_GZIP
  ? (process.env.USE_GZIP === 'true' ? true : false)
  : true;
let casClient;

const sessionOptions = {
  store: new FileStore,
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: true,
  name: 'kmx.' + APP_NAME + '.connect.sid'
};

// App
const app = express();

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
  // res.header("X-Powered-By",' 3.2.1')
  // res.header("Content-Type", "application/json;charset=utf-8");
  next();
});


if (USE_GZIP) {
  app.use(compression());
}
app.use(cookieParser());
app.use(session(sessionOptions));

if (process.env.HADOOP_API_URL) {
  const filter = (pathname, req) => (
    pathname.match(/^\/explorer\.(html|js).*|^\/(static|webhdfs)\/.*|^\/jmx.*/) &&
      req.method === 'GET'
  )

  app.use(proxy(filter, { target: process.env.HADOOP_API_URL, changeOrigin: true }))
}

// if (process.env.CM_URL) {
//   const filter = (pathname, req) => (
//     pathname.match(/^\/api\/v14\/clusters\/cluster\/services\/yarn\/config/) &&
//       req.method === 'GET'
//   )

//   app.use(proxy(filter, { target: process.env.CM_URL, changeOrigin: true }))
// }

if (USE_CAS) {
  app.use((req, res, next) => {
    req.sn = uuid.v4();
    function getLogger(type = 'log', ...args) {
      let user = 'unknown';
      try {
        user = req.session.cas.user;
      } catch(e) {}

      return console[type].bind(console[type], `${req.sn}|${user}|${req.ip}|`, ...args);
    }

    req.getLogger = getLogger;
    next();
  });

  casClient = require('./src/casClient');
  app.use(casClient.core());
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (USE_CAS) {
  app.get('/cas-info', (req, res, next) => {
    res.json(req.session.cas);
  })
  app.get('/logout', function(req, res, next) {
    // req.session.destroy(function (err) {
    //   if (err) {
    //     console.error(err);
    //   } else {
    //     // clearCookie will make slo not working.
    //     res.clearCookie(sessionOptions.name);
    casClient.logout()(req, res, next);
    //   }
    // });
  });
}

app.use(express.static('public'));

app.get('*', function (request, response){
  response.sendFile(path.resolve(__dirname, 'public', 'index.html'))
});
app.post('*', function (request, response) {
  console.log(request);
});

var server = app.listen(PORT, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('app listening at http://%s:%s', host, port);
});
