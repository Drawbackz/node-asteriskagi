import net from "net";
import events from "events";
import {AGIChannel} from "./AGIChannel";

export class AGIClient extends events.EventEmitter {

  static Event = {
    CALL: "call",
    HANGUP: "hangup",
    ERROR: "error"
  };

  private _dataBuffer = "";
  private _channel: AGIChannel | null = null;

  private _parseVariables(data: string): Record<string, string> {
    const lines = data.split("\n");
    return lines.reduce<Record<string, string>>((acc, line) => {
      if(line.startsWith("agi_")) {
        const [key, value] = line.split(":").map((item) => item.trim());
        acc[key.substring(4)] = value;
      }
      return acc;
    }, {});
  }

  private _handleData = async (data: string) => {
    try {
      if(data.includes("HANGUP")) {
        this._socket.removeListener("data", this._handleData);
        this._socket.end();
        return;
      }
      if(!this._channel) {
        this._dataBuffer += data.toString();
        if(this._dataBuffer.includes("\n\n")) {
          this._channel = new AGIChannel(
              this._socket,
              this._parseVariables(this._dataBuffer)
          );
          this._channel.on("error", (err) => this.emit(AGIClient.Event.ERROR, this, err));
          this._socket.once("end", () => this.emit(AGIClient.Event.HANGUP, this));
          this.emit(AGIClient.Event.CALL, this);
        }
      }
    }
    catch(err) {
      this.emit("error", this, err);
    }
  };

  constructor(private _socket: net.Socket) {
    super();
    this._socket.on("data", this._handleData);
  }

  get remoteAddress(): string | false {
    return this._socket.remoteAddress?.split(":").pop() || false;
  }

  get channel(): AGIChannel | null {
    return this._channel;
  }

  get callerId(): { name: string, number: string } {
    return {
      name: this.channel?.args.calleridname || "",
      number: this.channel?.args.callerid || ""
    };
  }

  get agi(){
    return this.channel!.agi;
  }

  get exec(){
    return this.channel!.exec;
  }

  toString = () => {
    let formattedCallerId = this.callerId.number || this.callerId.name;
    if(this.callerId.name !== formattedCallerId) {
      formattedCallerId = `${this.callerId.number} "${this.callerId.name}"`;
    }
    return `${this.remoteAddress} => ${formattedCallerId}`;
  };
}
