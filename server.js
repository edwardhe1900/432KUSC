// server.js
const express = require('express');
const got = require('got');
const { Readable } = require('stream');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Official KUSC Stream URLs directly from kusc.org
const KUSC_STREAM_URLS = [
  'https://playerservices.streamtheworld.com/pls/KUSCAAC96.pls', // High Quality (Recommended)
  'https://playerservices.streamtheworld.com/pls/KUSCAAC32.pls', // High Efficiency (HE-AAC with low data usage)
  'https://playerservices.streamtheworld.com/pls/KUSCMP256.pls'  // Premium Quality (AAC 256kbps)
];

// Route to proxy the radio stream (no server-side pitch shifting)
app.get('/stream', async (req, res) => {
  try {
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    console.log(`Attempting to stream from ${KUSC_STREAM_URLS[0]}`);
    
    // Try to get the primary stream
    let streamResponse;
    try {
      streamResponse = await got.stream(KUSC_STREAM_URLS[0], {
        timeout: {
          request: 10000
        },
        retry: {
          limit: 2
        }
      });
    } catch (err) {
      console.log(`Primary stream failed, trying fallback: ${KUSC_STREAM_URLS[1]}`);
      // Try first fallback
      try {
        streamResponse = await got.stream(KUSC_STREAM_URLS[1], {
          timeout: {
            request: 10000
          }
        });
      } catch (err2) {
        console.log(`Secondary stream failed, trying last resort: ${KUSC_STREAM_URLS[2]}`);
        // Try second fallback (demo station)
        streamResponse = await got.stream(KUSC_STREAM_URLS[2]);
      }
    }
    
    // Just pipe the stream - we'll do pitch shifting on the client side
    streamResponse.pipe(res);
    
    // Handle errors
    streamResponse.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Stream error');
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).send('Error connecting to radio stream');
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});