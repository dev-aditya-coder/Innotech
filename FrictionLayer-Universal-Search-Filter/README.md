# FrictionLayer — Search Filter + Category/Keyword Feed Blocker

A Chrome extension prototype with two independent features:

- **Search Filter:** estimates relevance on supported search engines and YouTube Search.
- **YouTube Feed Filter:** on YouTube Home/recommendation surfaces, hides visible feed cards when their title or visible metadata matches one of the selected block categories (Study, Research, Work, Entertainment) or a custom keyword/phrase.

## Install
1. Extract this ZIP.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted `FrictionLayer-Universal-Search-Filter` folder.
5. Open YouTube, open the FrictionLayer extension popup, enable **YouTube feed filter**, select categories and/or enter comma-separated keywords, then click **Save feed settings**.

## Important prototype limits
- Category matching is a transparent list of keywords, not an AI classifier. It can miss relevant videos or hide unrelated ones.
- It inspects visible titles/channel/description metadata; it does not analyze the full video or transcript.
- YouTube Search results (`/results`) are left to the separate Search Filter.
- Videos/Shorts separation is intentionally not part of this version.
- The `Restore feed` control restores items hidden by the feed filter for the current page.


## Feed Filter behavior
The Feed Filter now works as an allowlist: when enabled and one or more categories/keywords are selected, only cards matching at least one selected category or keyword remain visible. If no categories are selected, the full feed is shown. Category matching is heuristic keyword matching against visible titles and metadata, not AI classification. YouTube search results remain reserved for the separate Search Filter.


## Feed Filter categories (v0.3.0)
The allowlist now offers Study, Gaming, Music, Sports, News, Movies & TV, Technology, and Entertainment. Entertainment's keyword list intentionally excludes gaming, music, and sports so those can be selected independently. Category detection remains title/metadata keyword matching, not semantic AI.

The YouTube Search Filter content script is injected on all YouTube pages and stays active across YouTube's single-page navigation, so navigating from Home to Search should not lose the search feature.


## Independent Videos / Shorts filter (v0.4.0)
- A separate popup section controls regular YouTube videos versus Shorts; it is not part of the category Feed Filter settings.
- Enable the section and select Videos only, Shorts only, or both. If neither type checkbox is selected, the type filter leaves content unchanged.
- The type filter deliberately skips YouTube search results and the Shorts player, so it should not interfere with the search filter.
- YouTube's DOM changes frequently; test the behavior in Chrome on Home and recommendation feeds.
