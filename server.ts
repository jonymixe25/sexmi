import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import ytdl from "@distube/ytdl-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple in-memory cache for YouTube video info
const ytInfoCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function startServer() {
  const app = express();
  const PORT = 3000;
  const NODE_ENV = process.env.NODE_ENV || 'development';

  console.log(`[Server] Starting in ${NODE_ENV} mode...`);

  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });
  
  apiRouter.get("/yt/info", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL de YouTube es requerida" });
    }
    
    // Check cache
    const cached = ytInfoCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    try {
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: "URL de YouTube no válida" });
      }
      
      // Try fetching info with a retry mechanism
      let info;
      const USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ];

      for (let i = 0; i < USER_AGENTS.length; i++) {
        try {
          info = await ytdl.getInfo(url, {
            requestOptions: {
              headers: {
                'User-Agent': USER_AGENTS[i],
                'Accept-Language': 'en-US,en;q=0.9',
              }
            }
          });
          break; // Success
        } catch (err: any) {
          if (err.statusCode === 429 && i < USER_AGENTS.length - 1) {
            console.warn(`[API] Rate limited by YouTube, retrying with different User-Agent (attempt ${i + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
            continue;
          } else {
            throw err;
          }
        }
      }

      if (!info) throw new Error("Could not fetch info after retries");

      const data = {
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        thumbnail: info.videoDetails.thumbnails[0].url,
        duration: parseInt(info.videoDetails.lengthSeconds),
        videoId: info.videoDetails.videoId
      };
      
      // Update cache
      ytInfoCache.set(url, { data, timestamp: Date.now() });
      
      res.json(data);
    } catch (error) {
      console.error("[API] Error fetching YT info:", error);
      res.status(500).json({ error: "Error al obtener información del video (YouTube bloqueó la solicitud, intenta más tarde)" });
    }
  });

  apiRouter.get("/yt/stream", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL de YouTube es requerida" });
    }
    try {
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: "URL de YouTube no válida" });
      }
      
      console.log(`[API] Streaming audio from: ${url}`);
      
      // Set headers for audio streaming
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      const stream = ytdl(url, { 
        filter: 'audioonly', 
        quality: 'highestaudio',
        dlChunkSize: 0,
        highWaterMark: 1 << 20, // 1MB buffer
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          }
        }
      });

      stream.on('error', (err) => {
        console.error('[API] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error en el flujo de audio" });
        }
        stream.destroy();
      });

      res.on('close', () => {
        stream.destroy();
      });

      stream.pipe(res);
    } catch (error) {
      console.error("[API] Error streaming YT audio:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error al procesar el audio" });
      }
    }
  });

  // API 404 handler
  apiRouter.use((req, res) => {
    console.warn(`[API] Route not found: ${req.method} ${req.path}`);
    res.status(404).json({ error: `API route not found: ${req.path}` });
  });

  app.use("/api", apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
