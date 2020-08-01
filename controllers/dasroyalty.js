module.exports = function(app, arrDB){
  var fs = require('fs');
  var path = require('path');
  var bodyParser = require('body-parser');
  const cookieParser = require('cookie-parser');
  var routeduty = require('./routeduty');
  const dbhandle = require('./dbhandle');
  const dochandle = require('./dochandle');
  const monitoring = require('./monitoring');
  const pdflib = require('./pdflib');
  const utilsdocms = require('./utilsdocms');
  const dateformat = require('dateformat');
  var multer = require('multer');

  app.use(cookieParser());
  var urlencodedParser = bodyParser.urlencoded({extended:true});
  var drivetmp = "public/drive/", drive = "D:/Drive/", publicstr = 'public';
  dbhandle.settingDis((setting)=>{drivetmp = setting.publicdrive;});
  dbhandle.settingDis((setting)=>{publicstr = setting.publicstr;});

  dbhandle.settingDis((setting)=>{
    drive = setting.maindrive;
    //initialize file upload storage
    var storage =   multer.diskStorage({
      destination: function (req, file, callback) { callback(null, drivetmp +'Uploads/'); },
      filename: function (req, file, callback) { callback(null, file.originalname);}
    });
    var upload = multer({ storage : storage}).single('image');

    //get handle signing PDF
    app.get('/signpdf', function(req,res){
      utilsdocms.validToken(req, res,  function (decoded, id){
        getsignpdf(req, res, id);
      });
    });
    //post handle signing PDF
    app.post('/signpdf', urlencodedParser, function(req,res){
      utilsdocms.validToken(req, res,  function (decoded, id){
        postsignpdf(req, res, id);
      });
    });
    //post handle signing PDF
    app.post('/drawpdf', urlencodedParser, function(req,res){
      utilsdocms.validToken(req, res,  function (decoded, id){
        postdrawpdf(req, res, id);
      });
    });
    //post handle release PDF
    app.post('/releasedoc', urlencodedParser, function(req,res){
      utilsdocms.validToken(req, res,  function (decoded, id){
        releasesignpdf(req, res, id);
      });
    });
    //post handle signing PDF
    app.post('/cancelsign', urlencodedParser, function(req,res){
      utilsdocms.validToken(req, res,  function (decoded, id){
        if (fs.existsSync(drivetmp + 'PDF-temp/'+id+'.res.pdf')) fs.unlink(drivetmp + 'PDF-temp/'+id+'.res.pdf',()=>{res.json('ok');});
        else res.json('ok');
      });
    });
    //////////////////////////////////////FUNCTIONS START HERE///////////////////////////////////////////////

    //process document release after signing
    function releasesignpdf(req, res, id){
      dbhandle.userFind(id, function(user){
        utilsdocms.validateQRPass(req.body.user,req.body.hashval, function (result){
          if (result) {
            console.log('Release Document');
            var year = dateformat(Date.now(),'yyyy');var month = dateformat(Date.now(),'mmm').toUpperCase();
            pdflib.mergePDF(publicstr+req.body.filepath, drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf', drivetmp+'PDF-temp/'+req.body.user+'.res.pdf', parseInt(req.body.num,10), () =>{
              //ensure folders exists
              if (!fs.existsSync(drive+user.group)) fs.mkdirSync(drive+user.group);
              if (!fs.existsSync(drive+user.group+'/Released')) fs.mkdirSync(drive+user.group+'/Released');
              utilsdocms.makeDir(drive+user.group+'/Released/', year, month);
              //copy signed PDF from temp to next branch
              let dstFile = req.body.fileroute;
              if (fs.existsSync(drivetmp+'PDF-temp/'+req.body.user+'.res.pdf')) {
                if (fs.existsSync(drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf')){
                  fs.copyFileSync(drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf', drive+user.group+'/Released/'+year+'/'+month+'/'+req.body.fileroute+'.pdf'); //make a copy to drive folder
                  if (fs.existsSync(drivetmp+'PDF-temp/'+req.body.user+'.res.pdf')) fs.unlinkSync(drivetmp+'PDF-temp/'+req.body.user+'.res.pdf');
                }
                if (dochandle.getExtension(req.body.fileroute)!='.pdf') dstFile = req.body.fileroute+'.pdf';
                if (req.body.branch=='Originator'){
                  monitoring.getOriginator(req.body.fileroute, function(branch){
                    routeduty.routRoyal(req,res,drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf', drivetmp + branch + '/'+ dstFile, dstFile, drivetmp+user.group+'/'+req.body.fileroute);
                  });
                } else if (req.body.branch=='Boss'){
                  dbhandle.settingDis((setting)=>{
                    routeduty.routRoyal(req,res,drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf', drivetmp + setting.topmgmt + '/'+ dstFile, dstFile, drivetmp+user.group+'/'+req.body.fileroute);
                  });
                } else routeduty.routRoyal(req,res,drivetmp+'PDF-temp/'+req.body.fileroute+'.'+req.body.user+'.pdf', drivetmp + req.body.branch + '/'+ dstFile, dstFile, drivetmp+user.group+'/'+req.body.fileroute);
              } else {
                if (req.body.branch=='Boss'){
                  dbhandle.settingDis((setting)=>{
                    routeduty.routRoyal(req,res,drivetmp+user.group+'/'+req.body.fileroute, drivetmp + setting.topmgmt + '/' + req.body.fileroute, req.body.fileroute, drivetmp+user.group+'/'+req.body.fileroute);
                  });
                } else routeduty.routRoyal(req,res,drivetmp+user.group+'/'+req.body.fileroute, drivetmp + req.body.branch + '/' + req.body.fileroute, req.body.fileroute, drivetmp+user.group+'/'+req.body.fileroute);
              }
              dbhandle.monitorFindFile(req.body.fileroute, function(result){ //delete in monitoring
                if (result) {
                  deyt = dateformat(Date.now(),"dd mmm yyyy HH:MM");
                  if ((user.level.toUpperCase()=="CO") || (user.level.toUpperCase()=="GM")) dbhandle.actlogsCreate(id, Date.now(), 'Released signed document and forward to duty Admin', req.body.fileroute, req.ip);
                  else if ((user.level.toUpperCase()=="DEP") || (user.level.toUpperCase()=="EAGM")) dbhandle.actlogsCreate(id, Date.now(), 'Released Document and forward to the Boss Incoming', req.body.fileroute, req.ip);
                  dbhandle.settingDis((setting)=>{
                    result.route.push({deyt:deyt,branch:setting.topmgmt});
                    dbhandle.monitorAddRoute(dstFile, req.body.fileroute, result.route, path.resolve(drivetmp));
                  });
                }
              });
            });
          } else res.json('fail');
        });
      });
    }
    //process document signing post request
    function postsignpdf(req, res, id){
      dbhandle.userFind(id, function(user){
        console.log('Sign Document');
        pdflib.addSignMainDoc(user.group, id, publicstr+req.body.filepath, drivetmp+'PDF-temp/'+req.body.user+'.res.pdf', req.body.disX, req.body.disY, req.body.nodate, req.body.width, req.body.height, () =>{
          res.json('successful');
        });
      });
    }
    //process document signing post request
    function postdrawpdf(req, res, id){
      dbhandle.userFind(id, function(user){
        console.log('Draw Line to Document');
        upload(req, res, function(err){
          if (err) res.json('error');
          else {
            utilsdocms.sleep(2000).then(()=>{
                if (fs.existsSync(path.resolve(drivetmp +'Uploads/' + id + '.drw.png'))) {
                  fs.readFile(drivetmp +'Uploads/' + id + '.drw.png', 'utf-8', (err, data) => {
                    base64Data = data.replace(/^data:image\/png;base64,/, "");
                    let buff = new Buffer.from(base64Data,'base64');
                    fs.writeFile(drivetmp +'PDF-temp/' + id + '.new.drw.png',  buff, (err)=>{
                      pdflib.addLineDoc(user.group, id, publicstr+req.cookies.fileOpn, drivetmp+'PDF-temp/', () =>{
                        res.json('successful');
                        dbhandle.actlogsCreate(id, Date.now(), 'Upload File', req.cookies.fileAI.trim(), req.ip);
                      });
                    });
                  });
                } else res.json('error');
            })
          }
        });
      });
    }
    //Process get incoming function
    function getsignpdf(req, res, id, boolFile){
      console.log('return pages to the signing PDF');
      pdflib.returnPage(publicstr+req.query.filepath, drivetmp+'PDF-temp/'+req.query.user+'.pdf',req.query.num,() =>{
        res.json('successful');
      });
    };
  });
};