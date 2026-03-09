// 語族データ生成スクリプト（Gemini版）
// 使用方法: GEMINI_API_KEY=xxx node scripts/generate-word-families-gemini.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../..');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY が設定されていません');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

function parseCompactFormat(text) {
  // 形式: root|rootMeaning|word1,word2,word3
  // または root|word1,word2,word3（rootMeaningなし）
  const families = [];
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('//'));

  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;

    let root, rootMeaning, membersStr;
    if (parts.length >= 3) {
      [root, rootMeaning, membersStr] = parts;
    } else {
      [root, membersStr] = parts;
      rootMeaning = '';
    }

    const members = membersStr.split(',').map(s => s.trim()).filter(Boolean);
    if (members.length >= 2) {
      families.push({ root, rootMeaning, members });
    }
  }
  return families;
}

async function generateWordFamilies() {
  const words = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'word_list_for_family.json'), 'utf-8')
  );
  // 問題のある単語を安全な形式に変換
  const wordList = words.map(w => w.word).join(',');

  console.log(`単語数: ${words.length}`);
  console.log('Gemini API に送信中...');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
    },
  });

  const prompt = `以下のLEAP英単語リスト（${words.length}語）から、同じ語根（root）を持つ単語グループを抽出してください。

【条件】
- このリスト内に2語以上の仲間がいる場合のみグループを作成する
- 語根は接頭辞・接尾辞を除いた核となる語幹（ラテン語・ギリシャ語由来でも可）
- membersにはリスト内の単語のみを含める（リスト外の単語は絶対に入れない）
- 語根の意味は日本語で簡潔に（例: "行動する"、"運ぶ"、"作る"）

【出力形式】（この形式のみで出力、説明・前置き不要）
各行に: 語根|語根の意味（日本語）|メンバー単語をカンマ区切り

例:
act|行動する|act,action,active,react,interact,enact
form|形・形成する|form,reform,transform,perform,uniform,conform,formula
struct|組み立てる|structure,construct,instruct,destructive

【単語リスト】
${wordList}`;

  let rawText = '';
  try {
    const result = await model.generateContent(prompt);
    rawText = result.response.text();

    // 生レスポンスを保存
    fs.writeFileSync(path.join(ROOT_DIR, 'gemini_raw_response.txt'), rawText, 'utf-8');
    console.log(`生レスポンス保存完了 (${rawText.length} chars)`);

    console.log('パース中...');
    const families = parseCompactFormat(rawText);

    if (families.length === 0) {
      console.error('パース失敗。生レスポンスを確認してください: gemini_raw_response.txt');
      process.exit(1);
    }

    // 仕様書の形式に変換
    const wordFamilies = families.map((f, i) => ({
      id: i + 1,
      root: f.root,
      rootMeaning: f.rootMeaning,
    }));

    const wordFamilyMap = {};
    families.forEach((f, i) => {
      f.members.forEach(word => {
        wordFamilyMap[word] = i + 1;
      });
    });

    const output = { wordFamilies, wordFamilyMap };
    const outPath = path.join(ROOT_DIR, 'word_families_gemini.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`\n✓ 完了！`);
    console.log(`  語族グループ数: ${wordFamilies.length}`);
    const totalMembers = Object.keys(wordFamilyMap).length;
    console.log(`  語族に属する単語数: ${totalMembers} / ${words.length}`);
    console.log(`  保存先: ${outPath}`);

    console.log('\n--- サンプル（最初の15グループ） ---');
    families.slice(0, 15).forEach((f, i) => {
      console.log(`[${f.root}] ${f.rootMeaning}: ${f.members.join(', ')}`);
    });

  } catch (err) {
    if (rawText) {
      fs.writeFileSync(path.join(ROOT_DIR, 'gemini_raw_response.txt'), rawText, 'utf-8');
    }
    console.error('エラー:', err.message);
    process.exit(1);
  }
}

generateWordFamilies();
