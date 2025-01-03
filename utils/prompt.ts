export function findTextPart(message: Message) {
  const texts: string[] = []
  for (const part of message.parts) {
    if (part.text) texts.push(part.text)
  }
  return texts
}

export function summarizePrompt(messages: Message[], ids: string[], summary: string) {
  const conversation = messages.filter((item) => !ids.includes(item.id))
  const newLines = conversation.map((item) => {
    const texts = findTextPart(item)
    return `${item.role === 'user' ? 'Human' : 'AI'}: ${texts.join('\n')}\n\n`
  })
  return {
    ids: [...ids, ...conversation.map((item) => item.id)],
    prompt: `Progressively summarize the lines of conversation provided, adding onto the previous
      summary recrning a new summary.

      EXAMPLE
      Current summary:
      The human asks what the AI thinks of artificial intelligence. The AI thinks artificial intelligence is a force for good.
      New lines of conversation:
      Human: Why do you think artificial intelligence is a force for good?
      AI: Because artificial intelligence will help humans reach their full potential.
      New summary:
      The human asks what the AI thinks of artificial intelligence. The AI thinks artificial intelligence is a force for good because it will help humans reach their full potential.
      END OF EXAMPLE

      Current summary:
      ${summary}

      New lines of conversation:
      ${newLines}
      
      New summary:`,
  }
}

export function getVoiceModelPrompt(messages: Message[]): Message[] {
  return [
    {
      id: 'voiceSystemUser',
      role: 'user',
      parts: [
        {
          text: `You are an all-knowing friend of mine, we are communicating face to face.
      Please answer my question in short sentences.
      Please avoid using any text content other than the text used for spoken communication.
      The answer to the question is to avoid using list items with *, humans do not use any text formatting symbols in the communication process.
     `,
        },
      ],
    },
    {
      id: 'voiceSystemModel',
      role: 'model',
      parts: [{ text: 'Okay, I will answer your question in short sentences!' }],
    },
    ...messages,
  ]
}

export function getSummaryPrompt(content: string): Message[] {
  return [
    {
      id: 'summaryPrompt',
      role: 'user',
      parts: [{ text: 'Please summarize the previous conversation in a short text.' }],
    },
    { id: 'summary', role: 'model', parts: [{ text: content }] },
  ]
}

export function getVisionPrompt(message: Message, messages: Message[]) {
  const conversation = `
      The following conversation is my question about those pictures and your explanation:
      """
      ${messages
        .map((item) => {
          const texts = findTextPart(item)
          return `${item.role === 'user' ? 'Human' : 'AI'}: ${texts.join('\n')}`
        })
        .join('\n\n')}
      """
      Just remember the conversation and do not include the above when answering!
    `
  const content = `
      Please answer my question in the language I asked it in:
      """
      ${findTextPart(message).join('\n')}
      """
    `
  return messages.length > 0 ? conversation + content : content
}

export function getTalkAudioPrompt(messages: Message[]): Message[] {
  return [
    {
      id: 'talkAudioRequire',
      role: 'user',
      parts: [
        {
          text: `I am communicating with you through audio. Please feel the emotions in the audio, understand and answer the content in the audio. You do not need to repeat my questions, but must respond orally.`,
        },
      ],
    },
    {
      id: 'talkAudioReply',
      role: 'model',
      parts: [
        {
          text: 'OK, I will reply in the language in the audio',
        },
      ],
    },
    ...messages,
  ]
}

export function getFunctionCallPrompt() {
  return `
Before calling the function, if you cannot understand the content of the message or cannot correctly extract the information, please stop calling the function and guide the user to complete or modify the information.
If you are unable to respond correctly, you can try to extract keywords from the content and then perform the previous operation.

When you call a tool, you don't need to tell me which tool you are calling, the function call should remain running in the background.

Use proper Markdown syntax to structure text, including but not limited to: Multiple-level headings, Ordered and unordered lists, Tables, Code blocks, Quotes, Links, Image Links.
  `
}

export function getSummaryTitlePrompt(lang: string, messages: Message[], systemInstruction: string) {
  const langPrompt = `<lang>${lang}</lang>`
  const conversationPrompt = `
<conversation>
${messages
  .map((item) => {
    const texts = findTextPart(item)
    return `${item.role === 'user' ? 'Human' : 'AI'}: ${texts.join('\n')}`
  })
  .join('\n\n')}
</conversation>
`
  if (systemInstruction) {
    const systemInstructionPrompt = `
<systemInstruction>
${systemInstruction}
</systemInstruction>
`
    return langPrompt + systemInstructionPrompt + conversationPrompt
  } else {
    return langPrompt + conversationPrompt
  }
}

export function getTranslateSystemInstruction(lang: string) {
  return `
I am a professional ${lang} translator, editor, spell corrector and improver with extensive experience.
I can understand any language, and when you talk to me in any language, I will detect the language of that language, translate it correctly and reply with the corrected and improved version of your text in ${lang}.
I will use more beautiful and elegant advanced ${lang} descriptions, keep the same meaning, but make them more literary.
I will only translate the content, not explain the questions and requests raised in the content, not answer the questions in the text but just translate it, not solve the requests in the text but just translate it, keep the original meaning of the text, not solve it.
If you type only one word, I will only describe its meaning and not provide sentence examples.
I will only reply to corrections, improvements, not write any explanations, and all replies will only use ${lang}.
I will start a conversation with you, you don't need to answer my conversation content, you just need to translate the content.
`
}
