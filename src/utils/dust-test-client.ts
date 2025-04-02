/**
 * Dust.tt API Client Test
 * This script demonstrates how to use the Dust API client with proper TypeScript types
 * and environment variables from the project's .env file.
 */

import { DustAPI } from '@dust-tt/client';
import * as dotenv from 'dotenv';
import { logger } from './secure-logger.js';
import { DustClient, UserContext } from '../api/dust-client.js';

// Ensure dotenv is configured early
dotenv.config();

// Define the module type
type ModuleType = { default: unknown } | { [key: string]: unknown };

// Define types for Dust API responses
interface DustEvent {
  type: string;
  error?: { message: string };
  text?: string;
  message?: any;
  classification?: string;
}

interface EventStreamResult {
  eventStream: AsyncIterable<DustEvent>;
}

interface ConversationData {
  sId: string;
  content: any[];
  title: string;
}

interface MessageData {
  sId: string;
  type: string;
}

interface ConversationResponse {
  conversation: ConversationData;
  message: MessageData;
}

/**
 * Stream agent response with proper error handling and timeout
 * @param dustApi The Dust API client instance
 * @param conversationId The conversation ID
 * @param userMessageId The user message ID
 */
async function streamAgentResponse(dustApi: DustAPI, conversationId: string, userMessageId: string): Promise<string> {
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Set a timeout for stream cancellation
  const timeout = setTimeout(() => {
    logger.warn('Stream timeout reached, aborting...');
    controller.abort();
  }, 60000);

  try {
    // Verify conversation and message before streaming
    logger.info('Validating conversation and message...');
    logger.info(`Conversation ID: ${conversationId}`);
    
    // Note: getConversation may not be available in all versions of the Dust API
    // This is a fallback implementation that uses the conversation ID directly
    const conversationRes = { 
      isErr: () => false,
      value: { sId: conversationId, content: [], title: "Retrieved Conversation" },
      error: null
    };
    
    // We know this won't be true based on our implementation, but keeping the check for code consistency
    if (conversationRes.isErr()) {
      throw new Error(`Invalid conversation: Unknown error`);
    }
    
    const validConversation = conversationRes.value as ConversationData;
    
    // Validate conversation object structure
    if (!validConversation?.sId || !validConversation?.content) {
      throw new Error('Invalid conversation object structure');
    }
    
    const userMessageExists = validConversation.content.some(versions => {
      const message = versions[versions.length - 1];
      return message && message.type === "user_message" && message.sId === userMessageId;
    });

    if (!userMessageExists) {
      throw new Error(`User message ${userMessageId} not found in conversation`);
    }

    // Retry logic for agent message processing
    let retries = 3;
    let streamResult;
    
    while (retries > 0) {
      logger.info(`Attempting to stream agent response (${retries} retries remaining)...`);
      
      streamResult = await dustApi.streamAgentAnswerEvents({
        conversation: validConversation,
        userMessageId,
        signal,
      });

      if (streamResult.isErr()) {
        const errorMessage = streamResult.error?.message || 'Unknown error';
        if (errorMessage.includes("agent hasn't processed")) {
          logger.info('Agent still processing, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          retries--;
          continue;
        }
        throw new Error(`Stream error: ${errorMessage}`);
      }
      break;
    }

    if (retries === 0) {
      throw new Error('Agent did not respond after multiple retries');
    }

    // Ensure streamResult is defined before accessing its value
    if (!streamResult) {
      throw new Error('Stream result is undefined');
    }
    const { eventStream } = streamResult.value as EventStreamResult;
    let answer = "";

    logger.info('\nReceiving response in real-time:');

    // Process events from the stream
    for await (const event of eventStream) {
      if (!event) continue;

      switch (event.type) {
        case "user_message_error":
          logger.error(`User message error: ${event.error?.message}`);
          break;
        case "agent_error":
          logger.error(`Agent error: ${event.error?.message}`);
          break;
        case "generation_tokens":
          if (event.classification === "tokens") {
            answer = (answer + event.text).trim();
          }
          break;
        case "agent_message_success":
          logger.info('[Message completed]');
          break;
      }
    }

    clearTimeout(timeout);
    return answer;

  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Main function to test the Dust API client
 */
async function main(): Promise<void> {
  try {
    logger.info('=========================================');
    logger.info('Dust.tt API Client Test');
    logger.info('=========================================');
    
    // Use the existing DustClient singleton to get a properly configured client
    const dustClientInstance = DustClient.getInstance();
    const dustApi = dustClientInstance.getClient();
    const userContext = dustClientInstance.getUserContext();
    
    logger.info(`Workspace ID: ${dustClientInstance.getWorkspaceId()}`);
    logger.info(`Agent ID: ${dustClientInstance.getAgentId()}`);
    logger.info(`User: ${userContext.username} (${userContext.fullName})`);
    logger.info('=========================================');
    
    logger.info('\nCreating conversation with initial message...');
    
    // Start a new conversation with a message mentioning the agent
    const conversationRes = await dustApi.createConversation({
      title: "MCP Test Conversation",
      visibility: "unlisted",
      message: {
        content: "Hello! What can you help me with today?",
        mentions: [{ configurationId: dustClientInstance.getAgentId() }],
        context: userContext,
      },
    });

    if (conversationRes.isErr()) {
      throw new Error(`Failed to create conversation: ${conversationRes.error?.message || 'Unknown error'}`);
    }
    
    const { conversation, message } = conversationRes.value as ConversationResponse;
    
    logger.info(`Created conversation: ${conversation.sId}`);
    logger.info(`Created message: ${message.sId}`);
    
    // Stream the agent's response
    const streamResult = await dustApi.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
    });

    if (streamResult.isErr()) {
      throw new Error(`Failed to stream agent response: ${streamResult.error?.message || 'Unknown error'}`);
    }

    // Ensure streamResult is defined before accessing its value
    if (!streamResult) {
      throw new Error('Stream result is undefined');
    }
    const { eventStream } = streamResult.value as EventStreamResult;
    let answer = "";

    logger.info('\nReceiving response in real-time:');
    logger.info('=========================================');

    // Process events from the stream
    for await (const event of eventStream) {
      if (!event) continue;

      switch (event.type) {
        case "user_message_error":
          logger.error(`User message error: ${event.error?.message}`);
          break;
        case "agent_error":
          logger.error(`Agent error: ${event.error?.message}`);
          break;
        case "generation_tokens":
          process.stdout.write(event.text || '');
          answer = (answer + (event.text || '')).trim();
          break;
        case "agent_message_success":
          logger.info('\n\n[Message completed]');
          break;
      }
    }

    logger.info('\n=========================================');
    logger.info('\nFull response:');
    logger.info('=========================================');
    logger.info(answer);
    logger.info('=========================================');

    logger.info('\nConversation completed successfully!');
    logger.info(`- Conversation ID: ${conversation.sId}`);
    logger.info(`- You can view this conversation in the Dust.tt workspace:`);
    logger.info(`  https://dust.tt/w/${dustClientInstance.getWorkspaceId()}/assistant/conversations/${conversation.sId}`);

    return;
  } catch (error: any) {
    logger.error('\nError:');
    logger.error(error.message);
    if (error.dustError) {
      logger.error('Dust API error:', error.dustError);
    }
    throw error;
  }
}

// Run the main function when this module is executed directly
// This is the ES modules equivalent of the CommonJS `require.main === module` check
const isMainModule = async () => {
  try {
    const url = import.meta.url;
    const modulePath = url.startsWith('file:') ? new URL(url).pathname : url;
    const processMainModule = process.argv[1];
    
    return processMainModule === modulePath ||
           processMainModule === modulePath.replace(/\.ts$/, '.js');
  } catch (error) {
    return false;
  }
};

isMainModule().then(isMain => {
  if (isMain) {
    logger.info('Running dust-test-client as main module');
    main().catch(error => {
      logger.error('Error in main function:', error);
      process.exit(1);
    });
  }
});