import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

const MIGRATED_DATA = {"events":[{"id":"event-1","date":"2026-09-05","title":""},{"id":"event-2","date":"2026-09-06","title":""},{"id":"event-3","date":"2026-09-12","title":""},{"id":"event-4","date":"2026-09-13","title":""},{"id":"event-5","date":"2026-09-19","title":""},{"id":"event-6","date":"2026-09-20","title":""},{"id":"event-7","date":"2026-09-21","title":""},{"id":"event-8","date":"2026-09-22","title":""},{"id":"event-9","date":"2026-09-23","title":""},{"id":"event-10","date":"2026-09-26","title":""},{"id":"event-11","date":"2026-09-27","title":""},{"id":"event-12","date":"2026-10-03","title":""},{"id":"event-13","date":"2026-10-04","title":""},{"id":"event-14","date":"2026-10-10","title":""},{"id":"event-15","date":"2026-10-11","title":""},{"id":"event-16","date":"2026-10-12","title":""}],"members":[{"id":"member-1","name":"吉岡父"},{"id":"member-2","name":"杉山父"},{"id":"member-3","name":"山澤父"},{"id":"member-4","name":"山口明父"},{"id":"member-5","name":"南父"},{"id":"member-6","name":"山口勇父"},{"id":"member-7","name":"安本父"},{"id":"member-8","name":"浅野父"},{"id":"member-9","name":"佐藤父"},{"id":"member-10","name":"谷川父"},{"id":"member-11","name":"向山父"},{"id":"member-12","name":"亀井父"},{"id":"member-13","name":"松田惺父"},{"id":"member-14","name":"長島父"},{"id":"member-15","name":"荒木父"},{"id":"member-16","name":"加藤父"},{"id":"member-17","name":"石山父"},{"id":"member-18","name":"大谷部父"},{"id":"member-19","name":"草野父"},{"id":"member-20","name":"古賀父"},{"id":"member-21","name":"齋藤父"},{"id":"member-22","name":"佐藤父"},{"id":"member-23","name":"篠崎父"},{"id":"member-24","name":"竹内父"},{"id":"member-25","name":"永井父"},{"id":"member-26","name":"本村父"},{"id":"member-27","name":"森田父"},{"id":"member-28","name":"矢羽田父"},{"id":"member-29","name":"赤羽父"},{"id":"member-30","name":"秋葉父"},{"id":"member-31","name":"石川晃父"},{"id":"member-32","name":"井上遥父"},{"id":"member-33","name":"井上竜父"},{"id":"member-34","name":"宇山父"},{"id":"member-35","name":"江見父"},{"id":"member-36","name":"加賀原父"},{"id":"member-37","name":"粕谷父"},{"id":"member-38","name":"亀井碧父"},{"id":"member-39","name":"川村父"},{"id":"member-40","name":"小池父"},{"id":"member-41","name":"高祖父"},{"id":"member-42","name":"小堀父"},{"id":"member-43","name":"紺野父"},{"id":"member-44","name":"内藤父"},{"id":"member-45","name":"中濱父"},{"id":"member-46","name":"長峰父"},{"id":"member-47","name":"松井父"},{"id":"member-48","name":"溝上父"},{"id":"member-49","name":"村山父"},{"id":"member-50","name":"本吉父"},{"id":"member-51","name":"山澤奏父"},{"id":"member-52","name":"山本諒父"},{"id":"member-53","name":"山本要父"},{"id":"member-54","name":"吉岡母"},{"id":"member-55","name":"杉山母"},{"id":"member-56","name":"山澤母"},{"id":"member-57","name":"舘母"},{"id":"member-58","name":"山口明母"},{"id":"member-59","name":"南母"},{"id":"member-60","name":"山口勇母"},{"id":"member-61","name":"安本母"},{"id":"member-62","name":"谷川母"},{"id":"member-63","name":"亀井母"},{"id":"member-64","name":"向山母"},{"id":"member-65","name":"浅野母"},{"id":"member-66","name":"松田母"},{"id":"member-67","name":"長島母"},{"id":"member-68","name":"荒木母"},{"id":"member-69","name":"石川母"},{"id":"member-70","name":"石山母"},{"id":"member-71","name":"大谷部母"},{"id":"member-72","name":"加藤母"},{"id":"member-73","name":"草野母"},{"id":"member-74","name":"古賀母"},{"id":"member-75","name":"齋藤母"},{"id":"member-76","name":"佐藤母"},{"id":"member-77","name":"篠崎母"},{"id":"member-78","name":"椙浦母"},{"id":"member-79","name":"高橋母"},{"id":"member-80","name":"竹内母"},{"id":"member-81","name":"筒井母"},{"id":"member-82","name":"永井母"},{"id":"member-83","name":"藤澤母"},{"id":"member-84","name":"本村母"},{"id":"member-85","name":"森田母"},{"id":"member-86","name":"矢羽田母"},{"id":"member-87","name":"赤羽母"},{"id":"member-88","name":"秋葉母"},{"id":"member-89","name":"石川晃母"},{"id":"member-90","name":"井上遥母"},{"id":"member-91","name":"井上竜母"},{"id":"member-92","name":"宇山母"},{"id":"member-93","name":"江見母"},{"id":"member-94","name":"加賀原母"},{"id":"member-95","name":"粕谷母"},{"id":"member-96","name":"亀井碧母"},{"id":"member-97","name":"川村母"},{"id":"member-98","name":"小池母"},{"id":"member-99","name":"高祖母"},{"id":"member-100","name":"小堀母"},{"id":"member-101","name":"紺野母"},{"id":"member-102","name":"内藤母"},{"id":"member-103","name":"中濱母"},{"id":"member-104","name":"長峰母"},{"id":"member-105","name":"松井母"},{"id":"member-106","name":"松浦母"},{"id":"member-107","name":"溝上母"},{"id":"member-108","name":"村山母"},{"id":"member-109","name":"本吉母"},{"id":"member-110","name":"山澤奏母"},{"id":"member-111","name":"山本要母"},{"id":"member-112","name":"山本諒母"}],"answers":{"member-2":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-3":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-4":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-15":{"event-1":"×","event-2":"×","event-3":"×","event-4":"△","event-5":"×","event-6":"△","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"△"},"member-16":{"event-1":"×","event-2":"×"},"member-24":{"event-1":"×","event-2":"×","event-3":"×"},"member-28":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-29":{"event-1":"○","event-2":"○"},"member-30":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×","event-12":"×","event-13":"×","event-14":"×","event-15":"×","event-16":"×"},"member-31":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×"},"member-35":{"event-1":"×","event-2":"×"},"member-39":{"event-1":"×","event-2":"○","event-3":"×"},"member-40":{"event-1":"×","event-2":"×"},"member-42":{"event-1":"○","event-2":"×"},"member-44":{"event-1":"×","event-2":"○"},"member-46":{"event-1":"×","event-2":"×","event-3":"×"},"member-49":{"event-1":"×","event-2":"×"},"member-50":{"event-1":"×","event-2":"×"},"member-51":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-52":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×","event-12":"×","event-13":"×","event-14":"×","event-15":"×","event-16":"×"},"member-56":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-68":{"event-1":"×","event-2":"×","event-3":"×","event-4":"○","event-5":"×","event-6":"○"},"member-71":{"event-1":"×","event-2":"×"},"member-74":{"event-1":"×","event-2":"×","event-4":"○","event-7":"○"},"member-77":{"event-1":"△","event-2":"○","event-3":"△","event-4":"△","event-5":"△","event-6":"△","event-7":"△","event-8":"△","event-9":"△","event-10":"△","event-11":"○"},"member-79":{"event-1":"×","event-2":"×","event-3":"○"},"member-80":{"event-1":"△","event-2":"△","event-3":"×"},"member-85":{"event-1":"×","event-2":"×"},"member-87":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×"},"member-97":{"event-1":"×","event-2":"×","event-3":"×"},"member-98":{"event-1":"×","event-2":"×"},"member-99":{"event-1":"×","event-2":"○","event-9":"○"},"member-100":{"event-1":"×","event-2":"×"},"member-102":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-105":{"event-1":"○","event-2":"○","event-3":"×"},"member-106":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"△","event-9":"△","event-10":"×","event-11":"×"},"member-109":{"event-1":"×","event-2":"○"},"member-110":{"event-1":"△","event-2":"△","event-3":"△","event-4":"△"},"member-112":{"event-1":"×","event-2":"△","event-3":"○"},"member-17":{"event-2":"○"},"member-18":{"event-2":"○","event-3":"○"},"member-20":{"event-2":"×"},"member-21":{"event-2":"×"},"member-25":{"event-2":"×"},"member-26":{"event-2":"×"},"member-32":{"event-2":"×"},"member-33":{"event-2":"○","event-5":"×"},"member-34":{"event-2":"○"},"member-36":{"event-2":"×"},"member-37":{"event-2":"○"},"member-47":{"event-2":"○","event-3":"○"},"member-48":{"event-2":"×"},"member-53":{"event-2":"○","event-6":"×"},"member-69":{"event-2":"○"},"member-70":{"event-2":"○","event-3":"○","event-8":"○"},"member-72":{"event-2":"○"},"member-75":{"event-2":"○"},"member-78":{"event-2":"○","event-3":"○"},"member-82":{"event-2":"○"},"member-83":{"event-2":"×","event-3":"○","event-5":"○"},"member-84":{"event-2":"×","event-3":"○"},"member-88":{"event-2":"○"},"member-89":{"event-2":"○"},"member-90":{"event-2":"×"},"member-91":{"event-2":"×"},"member-92":{"event-2":"×"},"member-95":{"event-2":"○","event-3":"○"},"member-96":{"event-2":"○"},"member-107":{"event-2":"×"},"member-108":{"event-2":"×"},"member-111":{"event-2":"○"},"member-86":{"event-7":"○","event-8":"○","event-9":"○"}}};

const MIGRATED_COMMENTS = [{"id":"densuke-comment-1","memberId":"member-1","text":"7/20車出し?? 運転手含めて7人。何でもOKです。","updatedAt":"2026-08-12T21:50:13","source":"densuke"},{"id":"densuke-comment-2","memberId":"member-2","text":"23日、夕方から予定があるため最後まではいられないかもしれないですが朝から行きます！よろしくお願い致します！","updatedAt":"2026-08-12T22:50:24","source":"densuke"},{"id":"densuke-comment-4","memberId":"member-4","text":"5/6　マイクロバス運転手でお願いします。","updatedAt":"2026-08-18T17:46:21","source":"densuke"},{"id":"densuke-comment-5","memberId":"member-5","text":"10/4 浦安市長杯帯同します。","updatedAt":"2026-08-16T13:42:48","source":"densuke"},{"id":"densuke-comment-6","memberId":"member-6","text":"7/20車出し?? セレナ運転手含め6名　道具・荷物・選手なんでもOKです。","updatedAt":"2026-08-12T21:31:59","source":"densuke"},{"id":"densuke-comment-7","memberId":"member-7","text":"8/1車出し??。運転手含め4名乗車可。なんでもOKです。","updatedAt":"2026-08-13T17:29:46","source":"densuke"},{"id":"densuke-comment-8","memberId":"member-8","text":"7/20車出し○。ノア、運転手含めて6名。何でも可。","updatedAt":"2026-08-14T15:41:51","source":"densuke"},{"id":"densuke-comment-9","memberId":"member-9","text":"8/1車出し??。ステップワゴンなんでも可。運転手含め6人乗り","updatedAt":"2026-08-16T12:53:50","source":"densuke"},{"id":"densuke-comment-12","memberId":"member-12","text":"5/2.6車だし??フリード運転手含4名。応援、選手◯","updatedAt":"2026-08-12T21:00:31","source":"densuke"},{"id":"densuke-comment-14","memberId":"member-14","text":"8/1(土)車出し??。ビアンテなんでも可。運転手含め7人乗り","updatedAt":"2026-08-16T07:51:23","source":"densuke"},{"id":"densuke-comment-15","memberId":"member-15","text":"8/30 車出し?? 運転手含め7名　何でも可。","updatedAt":"2026-09-02T20:10:57","source":"densuke"},{"id":"densuke-comment-16","memberId":"member-16","text":"8/30車出し??、何でも??デリカD5、運転手含め7人乗車可能です。","updatedAt":"2026-09-01T09:47:15","source":"densuke"},{"id":"densuke-comment-17","memberId":"member-17","text":"9/6(日)  車出し??7人乗り、何でも可","updatedAt":"2026-08-31T20:31:22","source":"densuke"},{"id":"densuke-comment-18","memberId":"member-18","text":"9/6 車出し??です。ノア運転手含め6人です。","updatedAt":"2026-09-03T08:48:56","source":"densuke"},{"id":"densuke-comment-19","memberId":"member-19","text":"12日車出し何でも◯、運転手入れて６人","updatedAt":"2026-08-24T15:42:50","source":"densuke"},{"id":"densuke-comment-21","memberId":"member-21","text":"8/30車出し◯ デリカミニ軽","updatedAt":"2026-09-03T16:11:04","source":"densuke"},{"id":"densuke-comment-23","memberId":"member-23","text":"8月30日車出し??です。デリカ運転手含め7人です。なんでも??です。","updatedAt":"2026-08-26T19:44:09","source":"densuke"},{"id":"densuke-comment-24","memberId":"member-24","text":"8/30 車出し??ステップワゴン運転手含めて6人可 なんでも??です。","updatedAt":"2026-09-02T19:07:40","source":"densuke"},{"id":"densuke-comment-33","memberId":"member-33","text":"9/6 車出し??　セレナ運転手含め6名乗車可　何でも可","updatedAt":"2026-09-02T19:09:50","source":"densuke"},{"id":"densuke-comment-34","memberId":"member-34","text":"9/6 車出し??アルファード運転手含め6人。荷物道具??","updatedAt":"2026-09-02T10:49:23","source":"densuke"},{"id":"densuke-comment-35","memberId":"member-35","text":"8/23 申し訳ありません　急遽葬儀参列となったので欠席させて下さい","updatedAt":"2026-09-02T10:51:33","source":"densuke"},{"id":"densuke-comment-37","memberId":"member-37","text":"9/6車出し??、セレナ運転手含め7人、なんでも可","updatedAt":"2026-09-01T20:17:45","source":"densuke"},{"id":"densuke-comment-39","memberId":"member-39","text":"9/6 車出し??　シエンタ運転手含めて4人乗りです。 なんでも??です。","updatedAt":"2026-09-02T18:40:58","source":"densuke"},{"id":"densuke-comment-40","memberId":"member-40","text":"4/18 車出し?? ヴォクシー6人乗れます。なんでも??です","updatedAt":"2026-09-02T19:22:55","source":"densuke"},{"id":"densuke-comment-44","memberId":"member-44","text":"9/6 車出し??アテンザ運転手含めて4人可 なんでも??です。","updatedAt":"2026-09-01T17:14:16","source":"densuke"},{"id":"densuke-comment-46","memberId":"member-46","text":"5月2日　車出し??　エルグランド　6人。何でも大丈夫です。","updatedAt":"2026-09-02T21:42:37","source":"densuke"},{"id":"densuke-comment-47","memberId":"member-47","text":"9/6車出し??です。セレナ8人乗りです。","updatedAt":"2026-09-02T07:59:23","source":"densuke"},{"id":"densuke-comment-50","memberId":"member-50","text":"7/19 午前中のみ参加します","updatedAt":"2026-09-03T13:31:23","source":"densuke"},{"id":"densuke-comment-53","memberId":"member-53","text":"9/6 練習試合　車出し??エクストレイル運転手含めて4人乗りです。 なんでも??です。","updatedAt":"2026-08-31T20:41:00","source":"densuke"},{"id":"densuke-comment-54","memberId":"member-54","text":"7/11 車出し??。運転手含め7人","updatedAt":"2026-08-12T21:49:56","source":"densuke"},{"id":"densuke-comment-55","memberId":"member-55","text":"23日　スコアラーとして帯同かグラウンド責任で人手が足りなければそちらの協力でも可。お任せいたします。スコアラーの場合は指導者号も兼ねます。","updatedAt":"2026-08-13T18:30:06","source":"densuke"},{"id":"densuke-comment-57","memberId":"member-57","text":"4/29（水）車出し??　N-BOX（軽）荷物、応援可。車足りなければ出せます。","updatedAt":"2026-08-12T22:29:35","source":"densuke"},{"id":"densuke-comment-58","memberId":"member-58","text":"7/20車だし??。何でも?です。","updatedAt":"2026-08-13T12:46:47","source":"densuke"},{"id":"densuke-comment-60","memberId":"member-60","text":"8/12運転手含め6名乗車可。なんでもOKです。","updatedAt":"2026-08-13T07:44:26","source":"densuke"},{"id":"densuke-comment-61","memberId":"member-61","text":"5/10 妹（莉央奈）帯同します。","updatedAt":"2026-08-12T23:29:47","source":"densuke"},{"id":"densuke-comment-62","memberId":"member-62","text":"7/20 車出し??です。なんでも??です。","updatedAt":"2026-08-12T21:35:29","source":"densuke"},{"id":"densuke-comment-63","memberId":"member-63","text":"7/11車だし◯運転手含4名","updatedAt":"2026-08-12T21:00:49","source":"densuke"},{"id":"densuke-comment-64","memberId":"member-64","text":"7/20 車出し??運転手含め4人です","updatedAt":"2026-08-13T08:55:24","source":"densuke"},{"id":"densuke-comment-68","memberId":"member-68","text":"7/12車出し??ステップワゴン　運転手含め7名 なんでもオッケーです。","updatedAt":"2026-09-03T19:08:22","source":"densuke"},{"id":"densuke-comment-70","memberId":"member-70","text":"7/12車出し?? エルグランド 7人乗り　何でも??です。","updatedAt":"2026-08-31T20:39:54","source":"densuke"},{"id":"densuke-comment-72","memberId":"member-72","text":"9/6車出し??、何でも??７人乗り、デリカD5です。","updatedAt":"2026-09-01T09:47:52","source":"densuke"},{"id":"densuke-comment-74","memberId":"member-74","text":"7/4 車出し??何でも可。ステップ運転手含め6人乗れます。","updatedAt":"2026-08-31T15:31:44","source":"densuke"},{"id":"densuke-comment-77","memberId":"member-77","text":"9/6車出せます5.6人乗れます何でもOK","updatedAt":"2026-09-03T10:41:00","source":"densuke"},{"id":"densuke-comment-78","memberId":"member-78","text":"9/7車出し??です。デリカ運転手含め７人です。","updatedAt":"2026-09-01T11:02:58","source":"densuke"},{"id":"densuke-comment-82","memberId":"member-82","text":"9/6車出し?? デリカ8人乗り 何でも??です。","updatedAt":"2026-09-02T07:27:50","source":"densuke"},{"id":"densuke-comment-85","memberId":"member-85","text":"8/23 車出しできます。荷物車??、道具車??、ヴォクシー、運転手母、5人乗れます。","updatedAt":"2026-08-24T17:35:32","source":"densuke"},{"id":"densuke-comment-89","memberId":"member-89","text":"9/6 石川晃母　エブリー　荷物車だせます。","updatedAt":"2026-09-02T16:30:38","source":"densuke"},{"id":"densuke-comment-90","memberId":"member-90","text":"5/2 車出し〇 ZRV 運転手含め4人。荷物・道具可です","updatedAt":"2026-09-03T18:24:51","source":"densuke"},{"id":"densuke-comment-96","memberId":"member-96","text":"9/6車だし◯クリッパーリオ3人乗車可　何でも◯","updatedAt":"2026-09-02T17:35:36","source":"densuke"},{"id":"densuke-comment-98","memberId":"member-98","text":"２日下の子の都合で2試合のみ参加しますm(_ _)m","updatedAt":"2026-09-02T19:33:23","source":"densuke"},{"id":"densuke-comment-99","memberId":"member-99","text":"9/6車出し??ノア6人乗りです。","updatedAt":"2026-09-01T19:54:14","source":"densuke"},{"id":"densuke-comment-105","memberId":"member-105","text":"松井母5/2車出し可ミラ4人(運転自信ないです)","updatedAt":"2026-09-01T07:22:51","source":"densuke"},{"id":"densuke-comment-109","memberId":"member-109","text":"7/19 午前中のみ参加します","updatedAt":"2026-09-03T13:31:01","source":"densuke"}];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalize(data = {}) {
  return {
    events: Array.isArray(data.events) ? data.events : [],
    members: Array.isArray(data.members) ? data.members : [],
    answers:
      data.answers && typeof data.answers === "object"
        ? data.answers
        : {},
    comments: Array.isArray(data.comments) ? data.comments : [],
    migrationInitialized: data.migrationInitialized === true,
  };
}

function twoMonthsAgo(now = new Date()) {
  const d = new Date(now);
  const originalDay = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() - 2);

  const lastDay =
    new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0
    ).getDate();

  d.setDate(
    Math.min(
      originalDay,
      lastDay
    )
  );

  d.setHours(0, 0, 0, 0);

  return d;
}

function cleanupOldData(data, now = new Date()) {
  const cutoff = twoMonthsAgo(now);
  const removedEventIds = new Set();

  data.events = data.events.filter(event => {
    if (!event?.date) return true;

    const eventDate =
      new Date(
        event.date +
          "T00:00:00"
      );

    if (
      Number.isNaN(
        eventDate.getTime()
      )
    ) {
      return true;
    }

    if (
      eventDate < cutoff
    ) {
      removedEventIds.add(
        String(event.id)
      );

      return false;
    }

    return true;
  });

  if (
    removedEventIds.size
  ) {
    for (
      const memberId
      of Object.keys(
        data.answers
      )
    ) {
      const row =
        data.answers[
          memberId
        ];

      if (
        !row ||
        typeof row !== "object"
      ) {
        continue;
      }

      for (
        const eventId
        of removedEventIds
      ) {
        delete row[eventId];
      }
    }
  }

  data.comments =
    data.comments.filter(
      comment => {
        if (
          !comment?.updatedAt
        ) {
          return true;
        }

        const updated =
          new Date(
            comment.updatedAt
          );

        if (
          Number.isNaN(
            updated.getTime()
          )
        ) {
          return true;
        }

        return (
          updated >= cutoff
        );
      }
    );

  return data;
}

async function getConfig(store) {
  try {
    const saved =
      await store.get(
        CONFIG_KEY,
        {
          type: "json",
        }
      );

    return {
      densukeVisible:
        saved?.densukeVisible !==
        false,
    };
  } catch {
    return {
      densukeVisible: true,
    };
  }
}

function adminOK(request) {
  const expected =
    process.env.ADMIN_PASSWORD ||
    "";

  const received =
    request.headers.get(
      "x-admin-password"
    ) || "";

  return Boolean(
    expected &&
    received === expected
  );
}

function mergeInitial(data) {
  let changed = false;

  if (
    !data
      .migrationInitialized
  ) {
    if (
      !data.events.length ||
      !data.members.length
    ) {
      const migrated =
        normalize(
          structuredClone(
            MIGRATED_DATA
          )
        );

      data.events =
        migrated.events;

      data.members =
        migrated.members;

      data.answers =
        migrated.answers;
    }

    if (
      !data.comments.length
    ) {
      data.comments =
        structuredClone(
          MIGRATED_COMMENTS
        );
    }

    data
      .migrationInitialized =
      true;

    changed = true;
  }

  return {
    data,
    changed,
  };
}

export default async request => {
  const store =
    getStore({
      name: STORE,
      consistency:
        "strong",
    });

  const url =
    new URL(
      request.url
    );

  try {
    if (
      request.method ===
      "GET"
    ) {
      if (
        url.searchParams.get(
          "config"
        ) === "1"
      ) {
        return json({
          config:
            await getConfig(
              store
            ),
        });
      }

      let saved = null;

      try {
        saved =
          await store.get(
            KEY,
            {
              type: "json",
            }
          );
      } catch {
        saved = null;
      }

      let data =
        normalize(
          saved || {}
        );

      const merged =
        mergeInitial(data);

      data =
        cleanupOldData(
          merged.data
        );

      await store.setJSON(
        KEY,
        data
      );

      return json({
        data,
      });
    }

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed",
        },
        405
      );
    }

    let body = {};

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          error:
            "Invalid JSON",
        },
        400
      );
    }

    const action =
      body.action || "";

    if (
      action ===
      "adminPing"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      return json({
        ok: true,
      });
    }

    if (
      action ===
      "setConfig"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      const config = {
        densukeVisible:
          body.config
            ?.densukeVisible !==
          false,
      };

      await store.setJSON(
        CONFIG_KEY,
        config
      );

      return json({
        ok: true,
        config,
      });
    }

    let current = {};

    try {
      current =
        (
          await store.get(
            KEY,
            {
              type: "json",
            }
          )
        ) || {};
    } catch {
      current = {};
    }

    let data =
      cleanupOldData(
        mergeInitial(
          normalize(
            current
          )
        ).data
      );

    if (
      action ===
      "adminSave"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      data =
        cleanupOldData(
          normalize(
            body.data || {}
          )
        );

      data
        .migrationInitialized =
        true;

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data,
      });
    }

    if (
      action ===
      "answer"
    ) {
      const eventId =
        String(
          body.eventId ||
            ""
        );

      const memberId =
        String(
          body.memberId ||
            ""
        );

      const status =
        String(
          body.status ||
            ""
        );

      if (
        !eventId ||
        !memberId
      ) {
        return json(
          {
            error:
              "Missing id",
          },
          400
        );
      }

      if (
        status &&
        ![
          "○",
          "△",
          "×",
        ].includes(status)
      ) {
        return json(
          {
            error:
              "Invalid status",
          },
          400
        );
      }

      if (
        !data.answers[
          memberId
        ]
      ) {
        data.answers[
          memberId
        ] = {};
      }

      if (status) {
        data.answers[
          memberId
        ][eventId] =
          status;
      } else {
        delete data.answers[
          memberId
        ][eventId];
      }

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data,
      });
    }

    if (
      action ===
      "comment"
    ) {
      const memberId =
        String(
          body.memberId ||
            ""
        );

      const text =
        String(
          body.text ||
            ""
        ).trim();

      if (
        !memberId ||
        !text
      ) {
        return json(
          {
            error:
              "Missing comment",
          },
          400
        );
      }

      if (
        text.length > 500
      ) {
        return json(
          {
            error:
              "Comment too long",
          },
          400
        );
      }

      const memberExists =
        data.members.some(
          m =>
            String(m.id) ===
            memberId
        );

      if (
        !memberExists
      ) {
        return json(
          {
            error:
              "Member not found",
          },
          404
        );
      }

      const comment = {
        id:
          `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,

        memberId,

        text,

        updatedAt:
          new Date()
            .toISOString(),

        source:
          "site",
      };

      data.comments.push(
        comment
      );

      if (
        data.comments.length >
        300
      ) {
        data.comments =
          data.comments.slice(
            -300
          );
      }

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        comment,
        data,
      });
    }

    return json(
      {
        error:
          "Unknown action",
      },
      400
    );
  } catch (error) {
    console.error(
      "attendance-data error:",
      error
    );

    return json(
      {
        error:
          "Server error",
      },
      500
    );
  }
};
