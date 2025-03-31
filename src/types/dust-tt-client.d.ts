// DUST SDK does not provide types, so we need to create our own
// src/types/dust-tt-client.d.ts
declare module '@dust-tt/client' {
  type DustAPIConfig = {
    url: string;
    workspaceId: string;
    apiKey: string;
    logger?: Console;
  };

  export class DustAPI {
    constructor(
      urlConfig: { url: string },
      authConfig: { workspaceId: string; apiKey: string },
      logger?: Console
    );
    
    getAgentConfigurations(): Promise<Result<AgentConfiguration[]>>;
    createConversation(options: ConversationOptions): Promise<Result<ConversationResponse>>;
    streamAgentAnswerEvents(params: StreamParams): Promise<Result<EventStream>>;
  }

  interface Result<T> {
    isErr(): boolean;
    error?: { message: string };
    value?: T;
  }
  
  // Add other interfaces as needed
}

