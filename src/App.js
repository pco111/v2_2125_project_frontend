import React, { useState, useEffect, useRef } from 'react';
import '@chatui/core/dist/index.css';
import Chat, { Bubble, useMessages } from '@chatui/core';
import { Button, Modal } from '@chatui/core';
import axios from 'axios';
import avatarImage from './assets/image.png'; // Import the local image

// Add global styles to ensure full-screen layout, updated background colors, and floating elements
const globalStyles = `
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  #root {
    height: 100vh;
    width: 100%;
  }
  .chat-container {
    background-color: #ffffff; /* White background for main chat content */
    height: 100vh;
  }
  .chatui-chat {
    height: 100vh !important;
    width: 100%;
  }
  .chatui-chat__main {
    overflow-y: auto !important; /* Make the message list scrollable */
    padding: 60px 10px 80px 10px !important; /* Add padding at the top for the floating button and bottom for the input box */
    max-height: none !important; /* Remove any max-height constraints */
  }
  .chatui-chat__footer {
    position: fixed !important; /* Float the input box at the bottom */
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    background-color: #ffffff !important; /* Match the chat background */
    z-index: 1 !important; /* Ensure it stays above the message list */
    padding: 10px;
    border-top: 1px solid #e0e0e0 !important; /* Add a subtle border for separation */
    box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.1) !important; /* Add a subtle shadow for the floating effect */
  }
  .floating-switch-button {
    position: fixed !important; /* Float the button at the top right */
    top: 10px !important;
    right: 10px !important;
    z-index: 2 !important; /* Ensure it stays above the message list and input box */
    background-color: #f5f5f5 !important; /* Light gray background */
    border: 1px solid #e0e0e0 !important;
    border-radius: 4px !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important; /* Add a subtle shadow for the floating effect */
  }
  .result-table {
    font-family: monospace;
    white-space: pre;
    text-align: left;
  }
`;

// Load the JSON data for prompting
const promptingData = require('./assets/clean_var_replaced_labeled_contracts_16_part_1.json'); // Adjust the path as needed
const jsonString = JSON.stringify(promptingData, null, 2); // Pretty-print for readability

// Load the test data
const testData = require('./assets/clean_var_replaced_test_data.json'); // Adjust the path as needed

// Define the new Gemini prompt with Chain of Thought instructions
const geminiPrompt = `
You are a Solidity security auditor. Below are some example smart contracts showing the contract source code and bug type in JSON format.
Each sub-json object is an instance with the following information:
- buggy_contract is the contract code that contains the bug.
- bug_type is the classification result we focus on.
All the information provided can be considered ground truth.
There are only eight bug types: correct, Overflow-Underflow, Re-entrancy, TOD, Timestamp-Dependency, Unchecked-Send, Unhandled-Exceptions, tx.origin.
Use these to educate yourself, and be prepared to give classification results on new contracts.
Those contracts will only have the buggy_contract information when we ask you to classify them.

Chain of Thought Instructions:
To classify a contract, follow these steps:
1. Analyze the contract code structure (e.g., functions, variables, control flow).
2. Identify potential vulnerability patterns (e.g., unchecked calls, timestamp usage, etc.).
3. Compare findings with the known vulnerability types.
4. Conclude with the most likely bug type based on your analysis.

${jsonString}

Now classify the following contract:
[CONTRACT]

Answer in format: Bug type: [BUG TYPE]
For example, your answer should look like this: Bug type: Re-entrancy
`;

// Function to remove comments and blank lines from the contract code
function removeCommentsAndBlankLines(code) {
  // Remove multi-line comments (/* ... */)
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (//...)
  code = code.replace(/\/\/.*/g, '');
  // Remove blank lines and lines with only spaces/tabs
  code = code.split('\n').filter(line => line.trim() !== '').join('\n');
  return code;
}

const App = () => {
  const { messages, appendMsg, setTyping } = useMessages([
    {
      type: 'text',
      content: { text: 'Welcome to the Smardity! Provide a contract for detecting whether it is vulnerable.' },
      position: 'left',
      user: { avatar: avatarImage },
    },
  ]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('CodeBERT-solidifi');
  const messageListRef = useRef(null);

  // Scroll to the bottom of the message list when new messages are added
  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages]);

  async function callMlModel(query, model) {
    if (model === 'gemini') {
      // Use Gemini API for prediction with the new COT prompt
      const MAX_RETRIES = 3;
      let retries = 0;
      let pred = 'UNKNOWN';

      while (retries < MAX_RETRIES) {
        try {
          // Replace [CONTRACT] placeholder with the actual query
          const finalPrompt = geminiPrompt.replace('[CONTRACT]', query);
          const response = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            {
              contents: [
                {
                  parts: [
                    {
                      text: finalPrompt,
                    },
                  ],
                },
              ],
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
              params: {
                key: "AIzaSyBUjX-8vwse6a9rnqSNVboRO8ojcvh-dDk",
              },
            }
          );

          const output = response.data.candidates[0].content.parts[0].text.trim();
          if (output.includes("Bug type:")) {
            pred = output.split("Bug type:")[1].split("\n")[0].trim();
          } else {
            pred = "UNKNOWN";
          }
          break; // Success, exit retry loop
        } catch (error) {
          console.error(`⚠️ Error calling Gemini API (attempt ${retries + 1}/${MAX_RETRIES}):`, error);
          retries++;
          if (retries < MAX_RETRIES) {
            console.log(`⏳ Sleeping 30 seconds before retrying...`);
            await new Promise(resolve => setTimeout(resolve, 30000)); // Sleep for 30 seconds
          } else {
            console.error(`❌ Max retries reached. Returning default prediction.`);
            pred = "Error: Max retries reached for Gemini API";
          }
        }
      }
      return `Bug type: ${pred}`;
    } else {
      // Use BERT for prediction (existing logic)
      try {
        const response = await fetch('http://localhost:5992/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: query, model: model }),
        });
        const data = await response.json();
        return data.prediction;
      } catch (error) {
        console.error('Error calling ML model:', error);
        return 'Error: Could not get prediction';
      }
    }
  }

  async function runGeminiTest() {
    setTyping(true);
    appendMsg({
      type: 'text',
      content: { text: 'Running Gemini test on the first 9 examples...' },
      position: 'left',
      user: { avatar: avatarImage },
    });

    const results = [];
    const testDataSubset = testData.slice(0, 9); // Limit to the first 9 examples
    for (let i = 0; i < testDataSubset.length; i++) {
      const example = testDataSubset[i];
      const buggyContract = removeCommentsAndBlankLines(example.contract); // Clean the contract
      const trueLabel = example.type;

      const rawPrediction = await callMlModel(buggyContract, 'gemini');
      const match = rawPrediction === `Bug type: ${trueLabel}` ? '✔' : '✘';
      results.push({ index: i + 1, trueLabel, predictedLabel: rawPrediction, match });
    }

    // Format the results as a table
    let table = ' # | True Label            | Predicted Label       | Match\n';
    table += '---|-----------------------|-----------------------|------\n';
    results.forEach(result => {
      table += `${result.index.toString().padStart(2)} | ${result.trueLabel.padEnd(21)} | ${result.predictedLabel.padEnd(21)} | ${result.match}\n`;
    });

    appendMsg({
      type: 'text',
      content: { text: table },
      position: 'left',
      user: { avatar: avatarImage },
      className: 'result-table',
    });

    setTyping(false);
  }

  async function handleSend(type, val) {
    if (type === 'text' && val.trim()) {
      appendMsg({
        type: 'text',
        content: { text: val },
        position: 'right',
      });

      if (val === '/gemini-test') {
        await runGeminiTest();
      } else {
        setTyping(true);
        const cleanedContract = removeCommentsAndBlankLines(val); // Clean the user input contract
        const mlResponse = await callMlModel(cleanedContract, selectedModel);
        setTimeout(() => {
          appendMsg({
            type: 'text',
            content: { text: mlResponse },
            position: 'left',
            user: { avatar: avatarImage },
          });
          setTyping(false);
        }, 1000);
      }
    }
  }

  function renderMessageContent(msg) {
    const { type, content, user, className } = msg;
    if (type === 'text') {
      return <Bubble content={content.text} user={user} />;
    }
    return <Bubble content="Unsupported message type" />;
  }

  function handleOpenModal() {
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
  }

  function handleModelSelect(model) {
    setSelectedModel(model);
    setModalOpen(false);
    appendMsg({
      type: 'text',
      content: { text: `Switched to model: ${model}` },
      position: 'left',
      user: { avatar: avatarImage },
    });
  }

  return (
    <>
      {/* Inject global styles */}
      <style>{globalStyles}</style>
      <div style={{ height: '100vh', width: '100%' }}>
        {/* Floating "Switch Model" button at the top right */}
        <Button className="floating-switch-button" onClick={handleOpenModal}>
          Switch Model
        </Button>

        <Chat
          locale='en-US'
          className="chat-container"
          messages={messages}
          renderMessageContent={renderMessageContent}
          onSend={handleSend}
          placeholder="Type your message here..."
          ref={el => {
            if (el) {
              const messageList = el.querySelector('.chatui-chat__main');
              if (messageList) {
                messageListRef.current = messageList;
              }
            }
          }}
        />

        <Modal
          active={modalOpen}
          title="Select ML Model"
          showClose={false}
          onClose={handleCloseModal}
          actions={[
            {
              label: 'Close',
              onClick: handleCloseModal,
            },
          ]}
        >
          <p style={{ paddingLeft: '15px' }}>Choose a model:</p>
          <Button
            style={{ margin: '10px' }}
            onClick={() => handleModelSelect('CodeBERT-solidifi')}
          >
            CodeBERT-solidifi
          </Button>
          <Button
            style={{ margin: '10px' }}
            onClick={() => handleModelSelect('gemini')}
          >
            Gemini
          </Button>
        </Modal>
      </div>
    </>
  );
};

export default App;