export type LlmMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export type ToolCall = { name: string; arguments: Record<string, unknown> }

export type LlmResult = {
  utterance: string
  toolCalls: ToolCall[]
}

/** M0 mock: scripted coach that respects gates without a real model. */
export async function reasonMock(
  system: string,
  stateSummary: string,
  userText: string,
  exploreTurns: number,
  hasWish: boolean,
  hasActive: boolean,
  phase: string,
): Promise<LlmResult> {
  void system
  void stateSummary

  if (phase === 'recipe_active' && /做成|做完|完成/.test(userText)) {
    return { utterance: '', toolCalls: [{ name: 'complete_recipe', arguments: {} }] }
  }
  if (phase === 'recipe_active' && /太难|太简单|想换|卡住|没关系/.test(userText)) {
    return {
      utterance: '好，我们换成更小、仍贴着你愿望的一步。',
      toolCalls: [
        {
          name: 'adjust_recipe',
          arguments: {
            reason: userText,
            anchor: '打开电脑后',
            action: '打开备忘录，用一行字写下副业下一步动作名',
            durationMin: 1,
          },
        },
      ],
    }
  }

  if (!hasWish && exploreTurns === 0) {
    return {
      utterance: `收到：「${userText.trim()}」。先不用急着定死。\n\n这个愿望对你来说，重要的是哪一块？做成之后，你希望自己是什么感觉？`,
      toolCalls: [
        {
          name: 'set_draft',
          arguments: { wish: userText.trim().startsWith('想') ? userText.trim() : `想${userText.trim()}`, bumpExplore: true },
        },
      ],
    }
  }

  if (!hasWish && exploreTurns === 1) {
    return {
      utterance:
        '嗯，我听到了。\n\n为了靠近这个愿望，什么时候你几乎一定能抽出两分钟？哪一步一想到就烦？',
      toolCalls: [{ name: 'set_draft', arguments: { bumpExplore: true, note: userText } }],
    }
  }

  if (!hasWish && exploreTurns >= 2 && !/想去做|就是这个|愿意做|开始做/.test(userText)) {
    return {
      utterance:
        '慢慢清楚了。我还没有给你可执行步骤。\n\n若这就是你现在想靠近的事，并且你想去做，回我「想去做」；想继续改就直接说。',
      toolCalls: [],
    }
  }

  if (!hasWish && /想去做|就是这个|愿意做|开始做/.test(userText)) {
    const wish = '想发展我的副业'
    return {
      utterance: '好。那我们锁定愿望，并给你一个小但认真、贴着它的第一步。',
      toolCalls: [
        {
          name: 'confirm_wish',
          arguments: {
            text: wish,
            doneLooksLike: '备忘录里已经写下副业的下一个具体动作名',
            wantToDo: true,
          },
        },
        {
          name: 'issue_recipe',
          arguments: {
            anchor: '打开电脑后',
            action: '打开备忘录，用一行字写下「副业下一步：______」',
            durationMin: 2,
            rationale: '把模糊副业收成可命名的下一步，是朝变现的领先脚印',
          },
        },
      ],
    }
  }

  if (hasActive) {
    return {
      utterance: '配方还在。做成了告诉我；太难或想换也直接说。',
      toolCalls: [],
    }
  }

  return {
    utterance: '继续说说你的愿望——它为什么重要，以及你什么时候几乎一定能做一小步。',
    toolCalls: [],
  }
}
