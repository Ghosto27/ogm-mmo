import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { MyRoom } from "./MyRoom";
import { Encoder } from "@colyseus/schema";

Encoder.BUFFER_SIZE = 256 * 1024; // 32 КБ (можно увеличить до 64 * 1024 при необходимости)

const app = express();
const port = 2567;

// Разрешаем CORS для клиента Vite
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

// Раздаём статику из public/
app.use(express.static('public'));

const httpServer = createServer(app);

const gameServer = new Server();
gameServer.define("world", MyRoom);
gameServer.attach({ server: httpServer, maxPayload: 1024 * 1024 * 10 } as any);

gameServer.listen(port).then(() => {
    console.log(`Сервер Colyseus запущен на http://localhost:${port}`);
});