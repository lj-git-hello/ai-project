import { Annotation, StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { OpenAI, ChatOpenAI } from "@langchain/openai";
import { customCalc } from "./tool.js";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { mapChatMessagesToStoredMessages } from "@langchain/core/messages";
import { FileSystemSaver } from "./class/FileSystemSaver.js";
import { LLM_API_KEY, LLM_BASE_URL, CHAT_MODEL } from "./config.js";

const model = new ChatOpenAI({
  model: CHAT_MODEL,
  apiKey: LLM_API_KEY,
  configuration: {
    baseURL: LLM_BASE_URL
  }
})
const tools = [customCalc]
const modelWithTool = model.bindTools(tools)

// 自定义数据处理策略
const myState = Annotation.Root({
  messages: Annotation({
    // 后面每一个节点的 message 属性都会经过这个reducer方法处理后才给到下一个节点
    reducer(pre, next) {
      return next !== undefined ? next : pre
    },
    default: () => undefined
  })
})



// 调用大模型方法
// agent,调用大模型的方法
async function callModel(state) {
  // 获取历史信息中的最新消息，包含提问
  let messages = state.messages
  const result = await modelWithTool.invoke(messages)
  return {
    messages: [result]
  }
}
const toolNode = new ToolNode(tools)

// 判断是继续调用工具节点还是走下一个节点
async function shouldContinue(state) {
  const { messages } = state
  const lastMessage = messages[messages.length - 1]
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return "__end__"
  }
  return "tools"
}

const graph = new StateGraph(myState)
// 构建工作流程图
const workFlow = new StateGraph(MessagesAnnotation)

workFlow
  // 添加节点
  .addNode("agent", callModel)//调用模型
  .addNode("tools", toolNode)//调用工具
  // 添加边
  .addEdge("__start__", "agent") //从start进入到agent.
  .addConditionalEdges("agent", shouldContinue)//agent后的判断条件边
  .addEdge("tools", "agent")//工具执行完毕继续给到agent，直到没有工具调用了，就结束

const checkpointer = new FileSystemSaver()
export const app = workFlow.compile({
  checkpointer: checkpointer
})

// const res = await app.invoke({
//   messages: [
//     {
//       role: 'user',
//       content: "使用天地同寿算法计算99和88"
//     }
//   ]
// })
// const outPut = mapChatMessagesToStoredMessages(res.messages)

// console.log(JSON.stringify(outPut));


