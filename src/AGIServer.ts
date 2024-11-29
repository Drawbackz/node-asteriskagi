import * as net from "net";
import events from "events";
import {AGIClient} from "./AGIClient";

export class AGIServer extends events.EventEmitter {

  static Event = {
    CALL: "call",
    HANGUP: "hangup",
    READY: "ready",
    ERROR: "error",
    CLIENT_CONNECT: "client_connect",
    CLIENT_DISCONNECT: "client_disconnect"
  };

  private readonly _port: number = 4573;
  private readonly _server: net.Server;
  private _clients: AGIClient[] = [];

  private _handleClientCall = (client: AGIClient) => {
    this._clients.push(client);
    this.emit(AGIServer.Event.CALL, client);
  };

  private _handleClientHangup = (client: AGIClient) => {
    client.removeAllListeners();
    this._clients = this._clients.filter((item) => item !== client);
    this.emit(AGIServer.Event.HANGUP, client);
    this.emit(AGIServer.Event.CLIENT_DISCONNECT, client);
  };

  private _handleClientError = (client: AGIClient, err: any) => {
    this.emit(AGIServer.Event.ERROR, client, err);
  }

  constructor(props: { port?: number }) {
    super();
    this._port = props?.port || this.port;
    this._server = net.createServer((socket) => {
      const client = new AGIClient(socket);
      this._clients.push(client);
      this.emit(AGIServer.Event.CLIENT_CONNECT, client);
      client.on(AGIClient.Event.CALL, this._handleClientCall);
      client.on(AGIClient.Event.HANGUP, this._handleClientHangup);
      client.on(AGIClient.Event.ERROR, this._handleClientError);
    });
  }

  get port(): number {
    return this._port;
  }

  get running(): boolean {
    return this._server?.listening || false;
  }

  get clients(): AGIClient[] {
    return this._clients;
  }

  start = () => {
    if(this.running){
      throw new Error("Server is already running");
    }
    this._server.listen(this.port, () => {
      this.emit("ready", this);
    });
  };

  stop = () => {
    if(!this.running){
      throw new Error("Server is not running");
    }
    this._server.close();
  };

}
