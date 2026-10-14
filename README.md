## Technical details
> `POST: https://www.youtube.com/youtubei/v1/account/get_profile_card`
>
> Open a YouTube video, scroll down to the comment section, open DevTools, open the Network tab, click on a profile picture of any commenter, right click on the `get_profile_card` request, Copy Value, Copy Response.

[Example of Response](https://www.youtube.com/watch?v=vBhaFvwvRac&lc=UgzFjS3TkLJ3QZ51Vup4AaABAg):
```
...
"profileBadgeInfoChannelWide": {
                        "badges": [
                            {
                                "badgeIconUrl": "https://www.gstatic.com/youtube/img/identity/top_commenter_v1.png",
                                "badgeDesc": "Top commenter",
                                "badgeSubtitle": "Received one of the highest number of hearts from CodeSource"
                            }
                        ],
                        "profileSectionTitle": "On this channel",
                        "commentBadge": {
                            "commentBadgeIconUrl": "https://www.gstatic.com/images/icons/material/system/1x/comment_grey600_36dp.png",
                            "blackHeartIconUrl": "https://www.gstatic.com/images/icons/material/system/1x/favorite_grey600_36dp.png",
                            "commentDesc": "22 comments",
                            "blackHeartDesc": "7 received",
                            "commentBadgeA11yLabel": "Comment Badge",
                            "blackHeartA11yLabel": "Heart Badge"
                        }
                    },
...
commentInteractionViewModel": {
                                                                "headerPrefix": "Commented on",
                                                                "videoTitle": "The Untold Story of NoSQL Databases",
                                                                "commentContent": "Schema didn't disappear, it moved.\" This line stuck with me",
                                                                "chevronUrl": "https://www.gstatic.com/images/icons/material/system/1x/keyboard_arrow_right_grey600_36dp.png",
                                                                "index": 0,
                                                                "onTapA11yLabel": "View comment",
                                                                "rendererContext": {
                                                                    "commandContext": {
                                                                        "onTap": {
                                                                            "innertubeCommand": {
                                                                                "clickTrackingParams": "CAUQppQJGAEiEwjA6rnwwvSSAxVKLtYAHScRCqjKAQSxn_dk",
                                                                                "commandMetadata": {
                                                                                    "webCommandMetadata": {
                                                                                        "sendPost": true,
                                                                                        "apiUrl": "/youtubei/v1/notification/get_notification_menu"
                                                                                    }
                                                                                },
                                                                                "getCommentsFromInboxCommand": {
                                                                                    "videoId": "jnKy3yYHVsQ",
                                                                                    "linkedCommentId": "UgwrVpA2j0sxSYIRo4F4AaABAg",
                                                                                    "commentsFromInboxType": "COMMENTS_FROM_INBOX_TYPE_PROFILE_CARDS"
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                },
                                                                "loggingDirectives": {
                                                                    "trackingParams": "CAUQppQJGAEiEwjA6rnwwvSSAxVKLtYAHScRCqg=",
                                                                    "visibility": {
                                                                        "types": "12"
                                                                    }
                                                                }
                                                            }
```
## Claude
Analysis:
```
Request:
- Body is gzip-compressed protobuf (not JSON, despite Content-Type: application/json in headers)
- Required headers include X-Origin: https://www.youtube.com, Authorization: SAPISIDHASH ..., X-Goog-Visitor-Id, X-Youtube-Bootstrap-Logged-In: true
- SAPISIDHASH is time-based: SHA1(timestamp + " " + SAPISID + " " + https://www.youtube.com) and expires quickly
- The request must originate from a genuine browser session — YouTube detects and rejects external replication

data.profileCard.profileCardViewModel.profileIdentityInfo.profileIdentityInfoViewModel contains:
- channelDisplayName — channel name
- channelHandle — e.g. @codeninja-d3w
- leftOfBulletInfo — join date
- rightOfBulletInfo — subscriber count
- avatar.avatarViewModel.image.sources[] — avatar URLs at 48px, 88px, 176px
- profileInfoSection contains recent comments and badges (e.g. "Top commenter")

What blocks external access:
- YouTube's CSRF protection rejects requests where it can't verify browser origin
- The protobuf body contains session-specific tokens generated internally by YouTube's JS that can't be intercepted before they're set
```

---

## What is this [add-on](https://addons.mozilla.org/firefox/addon/wip-yt-profile-card-info)?
This is a browser extension designed to make [Profile Cards](https://support.google.com/youtube/answer/9409333) useful by extracting data from it and displaying that data below YouTube comments' handles as info boxes.

## What does this add-on do?
It works by programmatically clicking on the commenter's profile picture to trigger YouTube's Profile Card pop-up. The add-on then extracts specific data points from this pop-up, closes it automatically, and displays the extracted information as info boxes beneath the commenter's handle. It is partially forked from [YouTube™ Commenter Info](https://addons.mozilla.org/addon/yt-cmt-info), another related add-on.

The extracted information is six data types:
- `total comments` the commenter has posted in all videos of a content creator's YouTube channel
- number of `hearts received` from said content creator
- `pronouns` next to handle
- any special `badges` associated with the commenter
- `recent comments` on a channel
- `subscriptions`

## What is the technical implementation of this add-on?
It uses a sophisticated queuing system to sequentially manage profile data extraction, preventing multiple simultaneous pop-up interactions that could interfere with each other. Comments are processed one at a time with delays between operations to make sure information is properly extracted. Handle verification is included to ensure the extracted profile information matches the intended commenter, preventing misattribution in cases where pop-up timing issues might occur.

It also employs mutation observers to detect both existing comments on page load and new comments that appear during scrolling or dynamic loading (sort to Newest, clicking on Replies). This ensures comprehensive coverage regardless of how user navigate the comment section.

## What are the known limitations of this add-on?
It faces several inherent constraints due to its operational approach:
- **Since it depends on YouTube's Profile Card interface, any changes to YouTube's DOM structure or CSS classes could break the data extraction functionality.**
- The more comments a YouTube video/short/community post has, the more it has to process, and it might miss one or two comments.
- Since YouTube comment section loads dynamically, user will have to scroll down for more comments to load for the add-on to process more comments. Because of this, it might not include the badge and subscription's channel icon for some commenters' info boxes.
- Its operations could interfere with user's interaction, such as while searching in the search box. If user clicks while Profile Card is visible, information might not properly be extracted.
- [Bring back YouTube Comment Usernames](https://addons.mozilla.org/firefox/addon/youtube-找回留言區用戶名稱) will render this add-on useless because of the handle verification step.

## What is this add-on's purpose?
If you think about it, on most social media platforms, you click on other people's profile pictures. Duh! It's literally the "social" in "social media". Even though YouTube is technically one, it's primarily a video-sharing platform. Since when's the last time you click on a commenter's profile picture? That's why I created this add-on.
