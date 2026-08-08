import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import * as lancedb from "@lancedb/lancedb"
import fs from "fs"
import { EMBEDDING_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./config.js"


// 连接数据库
const db = await lancedb.connect("./lancedb-data")

// 创建表，一定要给一个初始数据
// await db.createTable("table1",
//   [
//     // 表的初始数据，这个初始数据决定了表的字段和类型
//     {
//       a: 123,
//       b: ""
//     }
//   ],
//   {
//     mode: "overwrite"
//   })


// const table1 = await db.openTable('table1')
// table1.add([{
//   a: 99,
//   b: "123"
// }])

// // 初始化向量模型
const embeddingModel = new OpenAIEmbeddings({
  model: EMBEDDING_MODEL,
  apiKey: EMBEDDING_API_KEY,
  dimensions: EMBEDDING_DIMENSIONS,
  configuration: {
    baseURL: EMBEDDING_BASE_URL
  }
})

let single = "张三很有钱"
let textArr = [
  "张三很有钱",
  "李四很帅",
  "王五很聪明"
]

let initStoreArr = []
for await (const [index, text] of textArr.entries()) {
  const embedding = await embeddingModel.embedQuery(text)
  initStoreArr.push({
    text: text,
    i: index,
    vector: embedding
  })
}

// 创建并初始化表
const table = await db.createTable('table', initStoreArr, {
  mode: "overwrite"
})


console.log(await table.schema())


// const metedataArr = textArr.map((e, index) => ({ id: index }))
// // const singleEmbedding = await embeddingModel.embedQuery(single)
// // const moreEmbedding = await embeddingModel.embedDocuments(textArr)

// // 向量储存对象
// const vectorstores = await MemoryVectorStore.fromTexts(textArr, [...metedataArr], embeddingModel)

// // 查到所有的向量
// const allEmbedding = vectorstores.memoryVectors

// const queryResult = await vectorstores.similaritySearch('谁最有钱?', 2)

// console.log(queryResult[0].pageContent)