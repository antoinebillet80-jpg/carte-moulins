import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import { google } from 'googleapis';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PARENT_FOLDER_ID = '13CQtu_ReSOaveZGdfEUGKkz3O1ZPzxOX';
const PHOTOS_FOLDER_NAME = 'Moulins_Photos';

const corsOrigins = [
  'http://localhost:5173',
  'https://moulins-9ci.pages.dev',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, httpOnly: true, sameSite: 'lax' },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0].value,
        accessToken,
        refreshToken,
      };
      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

const drive = (accessToken) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({
    version: 'v3',
    auth: oauth2Client,
  });
};

const findFileByName = async (driveService, fileName) => {
  try {
    const response = await driveService.files.list({
      q: `name='${fileName}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, webViewLink)',
      pageSize: 1,
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0];
    }
    return null;
  } catch (error) {
    console.error('Erreur en cherchant le fichier:', error);
    throw error;
  }
};

const getFrontendUrl = (req) => {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  // Fallback: use request origin if available
  if (req.get('referer')) {
    const referer = new URL(req.get('referer'));
    return referer.origin;
  }
  // Local development fallback
  return 'http://localhost:5173';
};

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive'] }));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    console.log('✅ Authentification réussie pour:', req.user.email);
    const frontendUrl = getFrontendUrl(req);
    res.redirect(`${frontendUrl}?auth=success`);
  }
);

app.get('/api/user', (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});

app.get('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Déconnecté' });
  });
});

app.get('/api/gpx', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    console.log('📥 Requête GPX reçue');
    const driveService = drive(req.user.accessToken);
    const fileId = '1myT98nNDyv38SuY87UQrZjgVXea167yP';

    console.log('✅ Utilisation du fichier ID:', fileId);

    const response = await driveService.files.get({
      fileId: fileId,
      alt: 'media',
    }, { responseType: 'text' });

    const gpxContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    console.log('✅ GPX téléchargé, taille:', gpxContent.length, 'bytes');

    res.setHeader('Content-Type', 'application/gpx+xml');
    res.send(gpxContent);
  } catch (error) {
    console.error('❌ Erreur en lisant le GPX:', error.message);
    res.status(500).json({ error: 'Erreur en lisant le fichier' });
  }
});

app.post('/api/gpx', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const gpxContent = req.body.gpx;
    const driveService = drive(req.user.accessToken);
    const fileId = '1myT98nNDyv38SuY87UQrZjgVXea167yP';

    const media = {
      mimeType: 'application/gpx+xml',
      body: gpxContent,
    };

    await driveService.files.update({
      fileId: fileId,
      media: media,
    });

    console.log('✅ GPX mis à jour avec succès');
    return res.json({ id: fileId, message: 'Fichier mis à jour' });
  } catch (error) {
    console.error('❌ Erreur en sauvegardant le GPX:', error.message);
    res.status(500).json({ error: 'Erreur en sauvegardant le fichier' });
  }
});

const createPhotosFolder = async (driveService) => {
  try {
    const response = await driveService.files.list({
      q: `name='${PHOTOS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (response.data.files && response.data.files.length > 0) {
      console.log(`✅ Dossier ${PHOTOS_FOLDER_NAME} trouvé`);
      return response.data.files[0].id;
    }

    console.log(`📁 Création du dossier ${PHOTOS_FOLDER_NAME} dans le dossier Carte...`);
    const folderResponse = await driveService.files.create({
      resource: {
        name: PHOTOS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [PARENT_FOLDER_ID],
      },
      fields: 'id',
    });

    console.log(`✅ Dossier ${PHOTOS_FOLDER_NAME} créé avec l'ID:`, folderResponse.data.id);
    return folderResponse.data.id;
  } catch (error) {
    console.error('Erreur en créant le dossier Photos:', error);
    throw error;
  }
};

app.get('/api/photo/:fileId', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const { fileId } = req.params;
    const driveService = drive(req.user.accessToken);

    const response = await driveService.files.get(
      {
        fileId: fileId,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    );

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('❌ Erreur en chargeant la photo:', error.message);
    res.status(500).json({ error: 'Erreur en chargeant la photo' });
  }
});

app.post('/api/upload-photo', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const { mouleName, photoData, fileName } = req.body;

    if (!mouleName || !photoData || !fileName) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const driveService = drive(req.user.accessToken);
    const folderID = await createPhotosFolder(driveService);

    const normalizedName = mouleName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '') +
      '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const fileExtension = fileName.split('.').pop();
    const newFileName = `moulin_${normalizedName}_${timestamp}.${fileExtension}`;

    const base64Data = photoData.includes(',') ? photoData.split(',')[1] : photoData;
    const buffer = Buffer.from(base64Data, 'base64');

    const fileMetadata = {
      name: newFileName,
      parents: [folderID],
    };

    const media = {
      mimeType: 'image/*',
      body: Readable.from(buffer),
    };

    const response = await driveService.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    console.log('✅ Photo uploadée:', newFileName, 'ID:', response.data.id);

    res.json({
      id: response.data.id,
      name: newFileName,
      webViewLink: response.data.webViewLink,
    });
  } catch (error) {
    console.error('❌ Erreur en uploadant la photo:', error.message);
    res.status(500).json({ error: 'Erreur en uploadant la photo' });
  }
});

app.get('/api/permissions', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const driveService = drive(req.user.accessToken);
    const fileId = '1myT98nNDyv38SuY87UQrZjgVXea167yP';

    const response = await driveService.files.get({
      fileId: fileId,
      fields: 'permissions',
    });

    const userPermissions = response.data.permissions || [];
    const userPermission = userPermissions.find(p => p.emailAddress === req.user.email);

    const canEdit = userPermission && (userPermission.role === 'owner' || userPermission.role === 'editor');

    console.log(`✅ Permissions pour ${req.user.email}: ${canEdit ? 'EDIT' : 'VIEW'}`);

    res.json({ canEdit });
  } catch (error) {
    console.error('❌ Erreur en vérifiant les permissions:', error.message);
    res.status(500).json({ error: 'Erreur en vérifiant les permissions' });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
  console.log(`🔐 Authentification Google: http://localhost:${PORT}/auth/google`);
});
