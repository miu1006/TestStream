const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const youtubeDl = require('youtube-dl-exec');
const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to get stream URL
async function getStreamUrl(url) {
  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });

    // Get the best format with both video and audio
    const format = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec !== 'none')
      .sort((a, b) => b.height - a.height)[0];

    if (!format) {
      throw new Error('No suitable format found');
    }

    return format.url;
  } catch (error) {
    console.error('Error getting stream URL:', error);
    throw error;
  }
}

// HTTP streaming endpoint for media players
app.get('/stream', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send('URL parameter is required');
  }

  try {
    // Get the direct stream URL
    const streamUrl = await getStreamUrl(url);
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Pipe the stream through FFmpeg
    ffmpeg(streamUrl)
      .inputOptions([
        '-re',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ])
      .outputOptions([
        '-f mpegts',
        '-codec:v mpeg1video',
        '-s 640x360',
        '-b:v 1000k',
        '-r 30',
        '-bf 0',
        '-muxdelay 0.001'
      ])
      .on('start', () => {
        console.log('Stream started');
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        if (!res.headersSent) {
          res.status(500).send('Stream error occurred');
        }
      })
      .pipe(res);

  } catch (err) {
    console.error('Error:', err);
    if (!res.headersSent) {
      res.status(500).send('Server error occurred');
    }
  }
});

// Add a simple status endpoint
app.get('/api/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Stream relay server running on port ${PORT}`);
});
