import { Game } from "./core/Game";
import "./style.css";

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app container in index.html");
}

const game = new Game(app);
game.start();
