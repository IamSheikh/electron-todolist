const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { google } = require('googleapis');
const readline = require('readline');

const expiryDate = new Date('2024-6-10');
app.setAsDefaultProtocolClient('simple-todolist');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';
let oAuth2Client;

function createWindow() {
  const today = new Date();

  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (today > expiryDate) {
    dialog
      .showMessageBox({
        type: 'warning',
        title: 'Application Expired',
        message: 'This application has expired.',
        buttons: ['Ok'],
      })
      .then(() => {
        app.quit();
      });

    mainWindow.loadFile('expired.html');
    return;
  }
  mainWindow.loadFile('index.html');

  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    authorize(JSON.parse(content));
  });
}
function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) {
      return getAccessToken(oAuth2Client);
    } else {
      oAuth2Client.setCredentials(JSON.parse(token));
      console.log('Authorization complete.');
    }
  });
}

function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
    });
  });
}

function backupDatabase(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const dbPath = path.join(app.getPath('userData'), 'my-database.db');
  const backupPath = path.join(
    app.getPath('userData'),
    `backup-${Date.now()}.db`
  );

  fs.copyFileSync(dbPath, backupPath);

  const fileMetadata = {
    name: path.basename(backupPath),
  };
  const media = {
    mimeType: 'application/x-sqlite3',
    body: fs.createReadStream(backupPath),
  };
  drive.files.create(
    {
      resource: fileMetadata,
      media: media,
      fields: 'id',
    },
    (err, file) => {
      if (err) {
        console.error('Error uploading file:', err);
      } else {
        console.log('File Id:', file.data.id);
        fs.unlinkSync(backupPath);
      }
    }
  );
}

ipcMain.on('backup-database', (event) => {
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) {
      console.log(
        'Authorization required. Please restart the app and authorize again.'
      );
    } else {
      oAuth2Client.setCredentials(JSON.parse(token));
      oAuth2Client
        .getAccessToken()
        .then((res) => {
          if (res.token) {
            backupDatabase(oAuth2Client);
          } else {
            console.log('Access token expired. Please authorize again.');
            getAccessToken(oAuth2Client);
          }
        })
        .catch((error) => {
          console.error('Error obtaining access token:', error);
          getAccessToken(oAuth2Client);
        });
    }
  });
});

const handleSquirrelEvent = require('./squirrel');

if (handleSquirrelEvent(app)) {
  return;
}

app.on('ready', createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

const dbPath = path.join(app.getPath('userData'), 'my-database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    'CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT)'
  );
});

ipcMain.on('add-task', (event, task) => {
  db.run('INSERT INTO todos (task) VALUES (?)', [task], function (err) {
    if (err) {
      console.error(err.message);
    }
    event.reply('task-added', { id: this.lastID, task });
  });
});

ipcMain.on('get-tasks', (event) => {
  db.all('SELECT * FROM todos', [], (err, rows) => {
    if (err) {
      throw err;
    }
    event.reply('tasks', rows);
  });
});
