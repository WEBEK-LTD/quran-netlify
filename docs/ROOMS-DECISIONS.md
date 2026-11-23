# Voice rooms & community — owner decisions after the design review

Complements the spec document «مواصفات الغرف الصوتية والمجتمع · نور القرآن» and the
design canvas (20 screens). Decided by the owner on 2026-11-23.

1. **Directed clap (السقفة الموجّهة):** rate-limited — at most once per minute from the
   same sender to the same speaker (plus the general limit of one reaction every 2 s).
2. **Profile counters** (claps sent/received, friends, followers) are visible to everyone
   on a public profile. **Who** clapped/followed/befriended (the lists of people) is
   visible to friends only.
3. **Mixed rooms:** women may be raised to speak, like men.
4. **Men's / women's groups** may open rooms of their own type or mixed rooms.
5. **Under 18 (13–17):** may enter mixed rooms and may speak on stage. Direct messages and
   friendship are **fully off** for them: they cannot send or receive DMs or friend
   requests. They may follow people and groups and be followed (follow = room
   notifications only, no contact). Their profile is always private. (Stricter than
   store policy requires — Apple 1.2 and Google Play's Child Safety Standards ask for
   reporting, blocking and published safety standards — and in line with "high privacy
   by default for minors" rules such as the EU DSA art. 28 and the UK Children's Code.)
6. **Dictionary:** «شديدة» → message never delivered, account suspended automatically until
   an admin decides; «محتملة» → message not delivered, sent to admins for review.
7. **«تذكرة من كتاب الله لقلبك اليوم»:** one ayah per person per day (same ayah all day,
   new one the next day), drawn from a curated list of hope-themed ayat without repeating
   until the list is exhausted.
8. **Adhan:** use freely-licensed recordings only; the user picks the muezzin, including a
   separate choice for Fajr (several Fajr muezzins).
9. **«مغادرة بهدوء» (leave quietly):** no "left the room" line in the chat.
10. **Room visibility:** two options when creating a room — «للجميع حسب النوع» or
    «لأعضاء الجروب فقط». «من جروباتي» is a filter in the rooms hub (rooms of the user's
    groups, including members-only ones), plus a «جروباتي» section.

11. **Public groups stay:** anyone can create a public group (listed in search, join
    directly) so people who don't know each other can gather and open rooms anyone of the
    allowed type can see. The rooms hub gets an «اكتشف الجروبات» section.
12. **People search:** lists only members of the searcher's own gender (decided 2026-11-23).
13. **Adhan muezzins:** Ahmed Khalaf (CC BY 4.0) is the default Fajr muezzin; add the four
    candidate recordings listed in `src/native/adhan/recordings.json` once they are fetched and
    checked by ear.
