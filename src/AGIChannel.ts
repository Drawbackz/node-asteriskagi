import * as net from "net";
import events from "events";
import {ChannelExecCommands} from "./constants";

type AGIChannelArguments = {
  channel?: string;
  language?: string;
  uniqueid?: string;
  version?: string;
  callerid?: string;
  calleridname?: string;
  callingpres?: string;
  callingani2?: string;
  callington?: string;
  callingtns?: string;
  dnid?: string;
  rdnis?: string;
  context?: string;
  extension?: string;
  priority?: string;
  enhanced?: string;
  accountcode?: string;
  threadid?: string;
}
type CommandResult = Promise<void | false>;
type ExecCommands = Record<typeof ChannelExecCommands[number], (args?: string) => CommandResult> & { command: (command: string, args?: string) => CommandResult }
type AGIResponse = { code: string, result: string | number, data: string };


export class AGIChannel extends events.EventEmitter {

  private readonly _socket: net.Socket;
  private readonly _args: AGIChannelArguments = {};
  private _currentOperation?: string | false = false;

  constructor(socket: net.Socket, args: AGIChannelArguments) {
    super();
    this._socket = socket;
    this._args = args;
  }

  get args() {
    return this._args;
  }

  get currentOperation() {
    return this._currentOperation;
  }

  agi = {
    answer: () => this._sendAGI("ANSWER"),
    hangup: () => this._sendAGI("HANGUP"),
    noOp: (args: string) => this._sendAGI(`NOOP ${args}`),
    verbose: (args: string) => this._sendAGI(`VERBOSE ${args}`),
    playback: async (filename: string) => {
      try {
        this._currentOperation = "playback";
        await this._sendAGI("STREAM FILE " + filename + " \"\"");
        this._currentOperation = false;
        return;
      }
      catch(err) {
        this.emit("error", "playback ERROR: " + err);
        return false;
      }
    },
    readVariable: async (variable: string) => {
      try {
        return await this._sendAGI("GET VARIABLE " + variable);
      }
      catch(err) {
        this.emit("error", "getVariable ERROR: " + err);
        return false;
      }
    },
    command: (command: string) => this._sendAGI(command)
  };

  exec: ExecCommands = ChannelExecCommands.reduce((result, command) => {
    return {
      ...result,
      [command]: async (args?: string) => result.command(command, args || "")
    };
  }, {
    command: async (command: string, args?: string) => {
      try {
        this._currentOperation = command;
        await this._sendAGI(`EXEC ${command}${args ? ` ${args}` : ""}`);
        this._currentOperation = false;
        return;
      }
      catch(err) {
        return false;
      }
    }
  } as ExecCommands);

  /**
   * Send FastAGI command to specified socket
   * @param {string} command
   */
  private _sendAGI = (command: string) => {
    return new Promise((resolve, reject) => {
      try {
        this._socket.once("data", (data) => {
          const response: any = this._parseResponse(data.toString().trim());
          if(response.code == "520") {
            this.emit("error", response.data);
            resolve(false);
            return;
          }
          if(response.result < 0) {
            this.emit("error", "Dead channel detected.");
            resolve(false);
            // reject("Dead channel detected.");
            this._socket && this._socket.end();
          }
          const final = response.data.match(/\((.*?)\)/);
          resolve(final ? final[1] : response.data);
        });
        if(this._socket.writable) {
          this._socket.write(command + "\n", "utf8");
        }
        else {
          // reject("Dead channel detected.");
          this._socket && this._socket.end();
          resolve(false);
        }
      }
      catch(err) {
        this.emit("error", "AGI Send Error:" + err);
        resolve(false);
        return;
      }
    });
  };

  /**
   * Parse AGI response codes
   * @param {string} str
   * @returns object - Response code,result,data
   */
  private _parseResponse(str: string): AGIResponse {
    try {
      let match = str.match(/(\d+)\s+result=(-?\d+)(?:\s+(.*))?/);
      if(match) {
        const [code, result, data] = match.slice(1);
        return {code, result: Number(result), data};
      }
      else if((match = str.match(/(\d+)-(.*)/))) {
        return {code: match[1], result: 0, data: match[2]};
      }
    }
    catch(err) {
      this.emit("error", "AGI Parse Error: " + err);
    }
    return {code: "", result: "", data: str};
  }
}
