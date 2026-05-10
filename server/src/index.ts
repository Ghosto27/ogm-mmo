import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { MyRoom } from "./MyRoom";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from '@colyseus/ws-transport';

Encoder.BUFFER_SIZE = 256 * 1024; // 32 КБ (можно увеличить до 64 * 1024 при необходимости)

const app = express();
const port = 2567;

// Разрешаем CORS для клиента Vite
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

const httpServer = createServer(app);

// Важно: в 0.16 конструктор Server() пустой, а сервер прикрепляется через attach
const gameServer = new Server( );
gameServer.define("world", MyRoom);
gameServer.attach({ server: httpServer });

gameServer.listen(port).then(() => {
    console.log(`Сервер Colyseus запущен на http://localhost:${port}`);
});