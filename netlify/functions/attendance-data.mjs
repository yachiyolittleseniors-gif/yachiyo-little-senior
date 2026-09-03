if (inComments) {
  if (
    /^(登録内容変更|トップに戻る|このページについて)/.test(
      line
    )
  ) {
    break;
  }

  /*
   * 伝助の実際の形式
   *
   * （篠崎父）9/6車出せます… [9/3 10:41]
   *
   * 名前 → memberName
   * 本文 → text
   * []内 → updatedAt
   */
  const m = line.match(
    /^[（(]([^()（）]+)[）)]\s*(.*?)\s*\[(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\]\s*$/
  );

  if (m) {
    const memberName = m[1].trim();
    const commentText = m[2].trim();

    const month = Number(m[3]);
    const day = Number(m[4]);
    const hour = Number(m[5]);
    const minute = Number(m[6]);

    /*
     * コメント日時の年を判定
     * 例：現在9月で [8/31] → 今年
     * 現在1月で [12/31] → 前年
     */
    let year = now.getFullYear();

    const candidate = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );

    if (
      candidate.getTime() >
      now.getTime() +
        31 * 24 * 60 * 60 * 1000
    ) {
      year -= 1;
    }

    const updated = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );

    comments.push({
      memberName,
      text: commentText,
      updatedAt: updated.toISOString(),
    });
  }

  continue;
}
