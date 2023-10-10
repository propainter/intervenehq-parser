import BaseChatCompletion, {
  GenerateChatCompletion,
  GenerateStructuredChatCompletion,
} from '~/chat-completion/base';
import OpenAIChatCompletion from '~/chat-completion/openai';

export default class ChatCompletion extends BaseChatCompletion<any> {
  client: BaseChatCompletion<any>;

  constructor() {
    super();

    this.client = new OpenAIChatCompletion();
  }

  generateStructured: GenerateStructuredChatCompletion = (...params) => {
    return this.client.generateStructured(...params);
  };

  generate: GenerateChatCompletion = (...params) => {
    return this.client.generate(...params);
  };
}
