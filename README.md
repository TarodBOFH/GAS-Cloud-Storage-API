# GAS-Cloud-Storage-API
An API to copy from GCP to Google Drive from Google Apps Scripts / Cloud Functions

See http://ramblings.mcpher.com/Home/excelquirks/goa as this script depends on it's library

## Usage instructions

1. Import MZx5DzNPsYjVyZaR67xXJQai_d-phDA33 library in your proyect

   * Optional: Clone and create a new GAS project with this library for your internal reference (I'm not sharing it on GAS, sry)
2. Trigger authorization to read and manage your Drive files:
   * i.e //DriveApp.getFiles();  
   * Commented out is enough
3. Upload your JSON credential to drive and note the file-id associated with them
4. Choose a namespace for your project
5. Call configure with the id of the credentials and your namespace
6. Start using the service methods. **Beware of quotas!**

## Sample Code

This snippet copies a bucket, previously sync'ed with rclone (https://rclone.org/) to Google Drive (including TeamDrives).

*Prior January 2018, Google Apps Script API was not working correctly with Teamdrive files*

```javascript
//Assume this project is cloned and referenced as library with the namespace CloudStorageApi

var creds = 'your-creds-file-id'; //JSON File with GCP Credentials for accessing the bucket
var name  = 'sample-cloud-storage-project'; //Namespace for cGoa (see File->Project Properties after running once for the scopes)
var recipient = 'your_email@example.org';

var flagFileName = '___flag_copied_files.flag'; //only copy files if the flag is present

function configure() {
   CloudStorageApi.ConfigureScript(creds, name);
}

function copyTask(bucket,folder, subject) { 
  configure();
  
  //Check if there are new files
  var exists = CloudStorageApi.getService().fileExists(bucket,flagFileName);
 
  if (exists) {
    CloudStorageApi.copyFromBucket(bucket,folder,false, flagFileName);
    CloudStorageApi.getService().deleteFileByName(bucket,flagFileName);
    
    //If there is a subject, send an email report
    if (subject != 'undefined') {
      MailApp.sendEmail(recipient, subject, "Cloud Storage API:\n\nFiles copied."); 
    }
  }    
}

//Sample usage
function copyFromBucketA() {
  copyTask('bucket-name', 'destination-folder-id','BucketA FileCopy');
}
```

