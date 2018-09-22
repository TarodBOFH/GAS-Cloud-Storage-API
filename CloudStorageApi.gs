//Singleton, see below
var SERVICE;

// See http://ramblings.mcpher.com/Home/excelquirks/goa

/** Bucket API
 * List Buckets for project  https://www.googleapis.com/storage/v1/b?project=[PROJECT_ID]
 * List bucket contents      https://www.googleapis.com/storage/v1/b/[BUCKET_NAME]/o
 */

//Run only once to populate the service account token into ScripProperties
function ConfigureScript(json,package) {
  
  //DriveApp.getFiles();  //trigger authorization to read Drive files. Commented out is enough
  
  var options =  {
      packageName: package,                                                               //to reference later with createGoa
      fileId: json,                                                                       //Drive file with JSON service account credentials ('0BxSgDD_tRlwJLVcyclFqTVI4clk' by default)
      scopes : cGoa.GoaApp.scopesGoogleExpand (['drive','cloud-platform','devstorage.read_write']),    //Permissions requested by this script (in advance, as per Google spec)
      service:'google_service'                                                                         //Not documented anywhere; this seems to be just a friendly name. Let's keep google_service since it works
    };
  
  cGoa.GoaApp.setPackage(
    PropertiesService.getScriptProperties(),
    cGoa.GoaApp.createServiceAccount(
      DriveApp,  
      options)
  );
  
  getService_(package); //Should create the singleton... 
}

/**
 * The StorageService object has the following methods
 * function listBucketContents(bucket) : list a bucket contents. Returns an array of JSON (https://cloud.google.com/storage/docs/json_api/v1/objects/list)
 * function getFile(fileUrl)           : retrive a file from a bucket in Blob format 
 * function deleteFile(fileUrl)        : deletes a file from a bucket (warning, it is permanent if no versioning has been activated)
*/
function getService() {
  if (!SERVICE) throw "Please call ConfigureScript first";
  
  return SERVICE; //should be already confiured
}


//@Todo: add exponential backoff functionality to the services and keep track of calls (i.e. do not launch new service if one is on wait)
function getService_(package) {
  //Classic Singleton (watch out, no thread-safe singleton. @todo: review with multiple projects now that accepts package on configuration
  //it does not matter though
  if (!SERVICE) {
    SERVICE = new Object(); //instantiate
    
    SERVICE.package = package;
  
    //internalVariable for token management
    SERVICE.goa = cGoa.GoaApp.createGoa(package, PropertiesService.getScriptProperties()).execute();
    
    //Build auth headers: internal helper function for passing options to UrlFetchApp
    SERVICE.getAuthHeaders_ = function() {
      if (!SERVICE.goa.hasToken()) throw "Error: No valid Session token";

      return {
          authentication: 'Bearer ' + SERVICE.goa.getToken(),
          Authorization: 'Bearer ' + SERVICE.goa.getToken()
      }
    };
    
    //List files in a bucket
    SERVICE.listBucketContents = function(bucket) {
      var result = UrlFetchApp.fetch('https://www.googleapis.com/storage/v1/b/'+bucket+'/o',{ headers: this.getAuthHeaders_() });
      result = JSON.parse(result);
    
      return result.items;
    };
  
    //Get a file from a bucket
    SERVICE.getFile = function(fileUrl) {    
      var result = UrlFetchApp.fetch(fileUrl+"?alt=media", { headers: this.getAuthHeaders_() });
      return result.getBlob();
    };

    //Get a file from a bucket
    SERVICE.getFileByName = function(bucket,fileName) {    
      var result = UrlFetchApp.fetch('https://www.googleapis.com/storage/v1/b/'+bucket+'/o/'+encodeURIComponent(fileName)+"?alt=media", { headers: this.getAuthHeaders_() });
      return result.getBlob();
    };
    
    //Delete a file from a bucket ( method: 'delete' )
    SERVICE.deleteFile = function(fileUrl) {    
      var result = UrlFetchApp.fetch(fileUrl, {
        'method': 'delete',
        headers: this.getAuthHeaders_() 
      });
      return result;
    };   

    //Delete a file from a bucket ( method: 'delete' )
    SERVICE.deleteFileByName = function(bucket, fileName) {    
      var result = UrlFetchApp.fetch('https://www.googleapis.com/storage/v1/b/'+bucket+'/o/'+encodeURIComponent(fileName), {
        'method': 'delete',
        headers: this.getAuthHeaders_() 
      });
      return result;
    };   
    
    //Fuck you; this 20 lines of code needed four hours!
    SERVICE.updateDriveFile = function(fileId, blob) {
      //Todo: get file, compute MD5 and compare with blob content MD5; skip
      //SEE All update operations now use PATCH instead of PUT on Drive v3
      var result = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+fileId+'?supportsTeamDrives=true&uploadType=resumable',{
        'method': 'patch',
        headers: this.getAuthHeaders_() 
      });
      
      var url = result.getAllHeaders().Location;

      //I am not even sure this still needs auth. Which could lead to some funny attacks...
      var req = UrlFetchApp.fetch(url, {
        'method': 'patch',
        'payload': blob.getBytes(),
        headers: this.getAuthHeaders_(),
        "contentLength": blob.length
      });
  
    };
    
    SERVICE.getDriveFileById = function(fileId) {
      var h = this.getAuthHeaders_();
      Logger.log(h);
      var result = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?supportsTeamDrives=true&alt=media',{
        headers: h
      });  
      return result.getBlob();
    };  
  
    SERVICE.getFileId = function(bucket,fileName) {
      var result = UrlFetchApp.fetch('https://www.googleapis.com/storage/v1/b/'+bucket+'/o/'+encodeURIComponent(fileName),{ headers: this.getAuthHeaders_() });
      result = JSON.parse(result);
      return result.id;
    };
  
    SERVICE.fileExists = function(bucket,fileName) {
      try {
        var result = UrlFetchApp.fetch('https://www.googleapis.com/storage/v1/b/'+bucket+'/o/'+encodeURIComponent(fileName),{ headers: this.getAuthHeaders_() });
        result = JSON.parse(result);
        if (result.id) return true;
        else return false;
        //@todo continue here
      } catch (err) {
        return false;
      }
      return true; //unreachable
    };
  }
  
  //Return our Singleton
  return SERVICE;
}

function copyFromBucket(bucket, destinationFolder, shouldDelete, flagName) {
  var storageService = getService();
  
  var items = storageService.listBucketContents(bucket); //get bucket contents

  Logger.log("Getting content of bucket "+bucket);
  
  for (var i = 0; i < items.length; i++) {
    var folder = DriveApp.getFolderById(destinationFolder); //in case it has been advanced deeper in the folder tree below, reset it to root folder (above)

    var link = items[i].selfLink;
    var fullName = items[i].name;
    
    Logger.log("Selflink:  ["+link+"] name: [+"+fullName+"]");
    
    //check if this is a file or a folder... //this has been evolved from a for-each folder to a much cleaner version
    var folders = items[i].name.split('/');
    var name = folders.pop(); //last in the chain is filename (or shouldbe)

    if (name === flagName) continue; //skip the flag (get rig of 404 errors and similar.
    
    //Create folder tree
    folders = folders.reverse(); //let's start from the first folder
    while (folders.length > 0) {
      var fName = folders.pop(); //I love this
      if (folder.getFoldersByName(fName).hasNext()) { //Have I already this folder inside Drive? yes -> continue and skip this folder
        folder = folder.getFoldersByName(fName).next(); //new destination folder for this file
        continue;
      }
      folder = folder.createFolder(fName);
    }

        

    var blob = storageService.getFile(link);
    
    //Does this file already exist?
    var iter = folder.getFilesByName(name);
    if (iter.hasNext()) {
      var f = iter.next();
      
      var driveBlob = f.getBlob();
      var fileId = f.getId();
      
      var same = compareBlobs(blob,driveBlob);
      
      if (!same) {
        Logger.log("Files are not equal, updating");
        storageService.updateDriveFile(fileId,blob);
      } else {
        Logger.log("Files are equal, skipping");
      }
      //FUUUUUUUUUUCK TEAM DRIVES!
      //Drive.Files.update({title: name}, fileId, blob, {supportTeamDrives: true});
    } else {
      Logger.log("File does not exist, creating");
      blob.setName(name);
      var file = folder.createFile(blob);
    }
    
    if (shouldDelete) {
      storageService.deleteFile(link);
    }
  }
  
  return items.length > 0; //Did we did something or not?
                           //may trigger a false possitive if we 
                           //skipped the flag file
}

function compareMD5(bucket, fileName, driveFileId) {
  Logger.log("Comparing MD5 from bucket ["+bucket+"] file ["+fileName+"] and driveFileId ["+driveFileId+"]");
  var service =  getService();
  var fileBlob = service.getFileByName(bucket,fileName);
  var driveBlob = service.getDriveFileById(driveFileId);
  
  return compareBlobs(fileBlob,driveBlob);
}

function compareBlobs(blob1,blob2) {
 
  //compare blobs
  if (blob1.length != blob2.length) return false; //early return
  var md5 = Utilities.DigestAlgorithm.MD5;
  var hash1 = Utilities.computeDigest(md5, blob1.getDataAsString());
  var hash2 = Utilities.computeDigest(md5, blob2.getDataAsString());
  
  for(var i = 0; i < hash1.length; i++) {
    try {
      if (hash1[i] != hash2[i]) return false;
    } catch (err) {
      return false;
    }
  }
  
  return true;  
}

function test() {
  //DriveApp.getFiles();  //trigger authorization to read Drive files. Commented out is enough

  ConfigureScript("0BxSgDD_tRlwJLVcyclFqTVI4clk", "test-cloud-api");

  copyFromBucket('a-given-bucket','0BzZGXq-k-MGecGFSM2wwRHRmUzA',false);
}
