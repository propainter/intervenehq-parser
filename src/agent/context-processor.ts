import { JSONSchema7 } from "json-schema";
import { ChatCompletionModels } from "src/chat-completion/base";
import Zod from "zod";
import Parser, {
  OperationMetdata,
  objectivePrefix,
  operationPrefix,
} from "~/agent/index";
import { stringifyContext } from "~/utils/context";
import { chunkSchema, getSubSchema } from "~/utils/openapi/chunk-schema";
import { deepenSchema, shallowSchema } from "~/utils/openapi/deepen-schema";
import { mergeSchema } from "~/utils/openapi/merge-schema";
import { t } from "~/utils/template";

export default class ContextProcessor {
  private parser: Parser;

  constructor(parser: Parser) {
    this.parser = parser;
  }

  async filter(
    params: OperationMetdata & {
      inputSchema: {
        body: JSONSchema7;
        query: JSONSchema7;
        path: JSONSchema7;
      };
    }
  ) {
    const contextShortlist = Array.from(
      new Set([
        ...(await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.body,
        })),
        ...(await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.query,
        })),
        ...(await this.shortlist({
          ...params,
          inputSchema: params.inputSchema.path,
        })),
      ])
    );

    const filteredContextForBody = this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.body,
      contextShortlist,
    });
    const filteredContextForQuery = this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.query,
      contextShortlist,
    });
    const filteredContextForPath = this.filterSchema({
      ...params,
      inputSchema: params.inputSchema.path,
      contextShortlist,
    });

    return {
      filteredContextForBody,
      filteredContextForQuery,
      filteredContextForPath,
    };
  }

  private async filterSchema(
    params: OperationMetdata & {
      inputSchema: JSONSchema7;
      contextShortlist: string[];
    }
  ) {
    const filteredContext: Record<string, JSONSchema7> = {};

    for (const key of Object.keys(params.context)) {
      let filteredSchema = shallowSchema(params.context[key]);
      const chunks = chunkSchema(params.context[key], true);

      for (const { schema: chunkSchema, propertyNames } of chunks) {
        const { shortlist } =
          await this.parser.chatCompletion.generateStructured({
            messages: [
              {
                role: "user",
                content: t(
                  [
                    ...objectivePrefix(params),
                    ...operationPrefix(params),
                    "And I came up with this input JSON schema to the resource:",
                    "```{{inputSchema}}```",
                    "From the context, here is `{{key}}`'s JSON schema:",
                    "```{{chunkSchema}}```",
                    "Your task is to shortlist a conservative set of properties from {{key}}'s" +
                      " JSON schema which may be relevant to achieve the objective.",
                  ],
                  {
                    inputSchema: JSON.stringify(params.inputSchema),
                    key,
                    chunkSchema: JSON.stringify(params.inputSchema),
                  }
                ),
              },
            ],
            generatorName: "shortlist_properties",
            generatorDescription:
              "Shortlist properties that are relevant given the objective",
            generatorOutputSchema: Zod.object({
              shortlist: Zod.array(Zod.enum(propertyNames as [string])),
            }),
            model: ChatCompletionModels.critical,
          });

        const subSchema = getSubSchema(chunkSchema, shortlist);
        filteredSchema = mergeSchema(filteredSchema, subSchema);
      }

      filteredContext[key] = deepenSchema(params.context[key], filteredSchema);
    }

    return filteredContext;
  }

  private async shortlist(params: {
    objective: string;
    context: Record<string, JSONSchema7>;
    provider: string;
    path: string;
    method: string;
    description: string;
    inputSchema: JSONSchema7;
  }) {
    if (Object.keys(params.context).length === 0) {
      return [];
    }

    const { shortlist } = await this.parser.chatCompletion.generateStructured({
      messages: [
        {
          role: "user",
          content: t(
            [
              ...objectivePrefix(params),
              ...operationPrefix(params),
              "And this is the input JSON schema to the resource:",
              "```{{inputSchema}}```",
            ],
            {
              description: params.description,
              inputSchema: JSON.stringify(params.inputSchema),
            }
          ),
        },
      ],
      generatorName: "shortlist_context",
      generatorDescription:
        "Shortlist context datum that are relevant given the objective",
      generatorOutputSchema: Zod.object({
        shortlist: Zod.array(Zod.enum(Object.keys(params.context) as [string])),
      }),
      model: ChatCompletionModels.critical,
    });

    return shortlist;
  }
}