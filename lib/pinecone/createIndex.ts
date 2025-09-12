import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function ensurePineconeIndex(channelID: string) {
  channelID = channelID.toLowerCase();
  try {
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes?.some(
      (index) => index.name === channelID
    );

    if (!indexExists) {
      await pinecone.createIndex({
        name: channelID,
        dimension: 3072, // For gemini-embedding-001
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1",
          },
        },
      });
    }
  } catch (error) {
    console.error("Failed to ensure Pinecone index:", error);
    throw error; // ✅ Throw the error so it's handled upstream
  }
}
