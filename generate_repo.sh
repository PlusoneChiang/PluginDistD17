#!/bin/sh
# ==============================================================================
# generate_repo.sh
#
# POSIX Shell script to scan stable/ and testing-live/ plugin directories along
# with state.json, and generate PluginMaster/repo.json and PluginMaster/meta.json
# for GitHub Pages.
#
# Requirements: jq (pre-installed on macOS / Linux)
# Usage: ./generate_repo.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/state.json"
OUTPUT_DIR="$SCRIPT_DIR/PluginMaster"
OUTPUT_FILE="$OUTPUT_DIR/repo.json"
META_FILE="$OUTPUT_DIR/meta.json"

mkdir -p "$OUTPUT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

[ -f "$STATE_FILE" ] || STATE_FILE="/dev/null"

# Find all plugin JSON files
JSON_FILES=$(find "$SCRIPT_DIR/stable" "$SCRIPT_DIR/testing-live" -name "*.json" 2>/dev/null | sort)

if [ -z "$JSON_FILES" ]; then
  echo "Warning: No plugin JSON files found in stable/ or testing-live/."
  exit 0
fi

# Extract git commit metadata (handles local vs GitHub Actions CI environment)
if [ -n "$GITHUB_SHA" ]; then
  GIT_COMMIT_FULL="$GITHUB_SHA"
  GIT_COMMIT_HASH=$(echo "$GITHUB_SHA" | cut -c1-8)
  GIT_COMMIT_DATE=$(git log -1 --format="%ci" "$GITHUB_SHA" 2>/dev/null || date -u +"%Y-%m-%d %H:%M:%S +0000")
else
  GIT_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  GIT_COMMIT_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  GIT_COMMIT_DATE=$(git log -1 --format="%ci" 2>/dev/null || echo "unknown")
fi

DIST_COMMIT=$(git log --grep="Update distribute" -1 --format="%s" 2>/dev/null | grep -oE "[0-9a-f]{40}" || echo "")
DIST_DATE=$(git log --grep="Update distribute" -1 --format="%ci" 2>/dev/null || echo "")

# Extract GitHub Repo Slug and Branch for Download URLs
REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
REPO_SLUG=$(echo "$REMOTE_URL" | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/\.]+)(\.git)?/\1/')
[ -z "$REPO_SLUG" ] && REPO_SLUG="PlusoneChiang/PluginDistD17"
BRANCH="tc/main"
RAW_BASE="https://raw.githubusercontent.com/$REPO_SLUG/$BRANCH"

# Generate meta.json
cat <<EOF > "$META_FILE"
{
  "commit_hash": "$GIT_COMMIT_HASH",
  "commit_full": "$GIT_COMMIT_FULL",
  "commit_date": "$GIT_COMMIT_DATE",
  "upstream_dist_hash": "$DIST_COMMIT",
  "upstream_dist_date": "$DIST_DATE",
  "repo_slug": "$REPO_SLUG",
  "branch": "$BRANCH"
}
EOF

# Execute single-pass jq aggregation for repo.json
jq -s --arg raw_base "$RAW_BASE" '
  def parse_ts(str):
    if str == null then 0
    else (str | sub("\\..*"; "") | sub("\\+.*"; "") | sub("Z$"; "") + "Z" | fromdateiso8601? // 0)
    end;

  (if .[0] == null or .[0] == {} then {} else .[0] end) as $st_full |
  ($st_full.Channels.stable.Plugins // {}) as $s_st |
  ($st_full.Channels["testing-live"].Plugins // {}) as $t_st |
  
  (.[1:] | map(select(type == "object" and .InternalName != null))) as $all_json |
  ($all_json | group_by(.InternalName)) as $groups |

  [
    $groups[] |
    (map(select(._Dip17Channel == "stable"))[0] // null) as $s |
    (map(select(._Dip17Channel == "testing-live"))[0] // null) as $t |
    ($s // $t) as $base |
    $base.InternalName as $iname |
    ($s == null and $t != null) as $is_testing_exclusive |

    ($s_st[$iname] // null) as $s_info |
    ($t_st[$iname] // null) as $t_info |

    # Changelogs
    (if $s != null and $s.Changelog != null then $s.Changelog
     elif $s_info != null and ($s_info.Changelogs | type == "object") and ($s_info.Changelogs | length > 0) then
       ($s_info.Changelogs | to_entries | last | .value.Changelog // null)
     else null end) as $s_cl |

    (if $t != null and $t.Changelog != null then $t.Changelog
     elif $t_info != null and ($t_info.Changelogs | type == "object") and ($t_info.Changelogs | length > 0) then
       ($t_info.Changelogs | to_entries | last | .value.Changelog // null)
     else null end) as $t_cl |

    # Timestamps
    (if $s_info != null and ($s_info.Changelogs | type == "object") and ($s_info.Changelogs | length > 0) then
       ($s_info.Changelogs | to_entries | last | .value.TimeReleased // null)
     else null end) as $s_ts |
    (if $t_info != null and ($t_info.Changelogs | type == "object") and ($t_info.Changelogs | length > 0) then
       ($t_info.Changelogs | to_entries | last | .value.TimeReleased // null)
     else null end) as $t_ts |

    (parse_ts($s_ts // $t_ts)) as $last_update |

    # Download Links
    (if $s != null then ($raw_base + "/stable/" + $iname + "/latest.zip") else ($raw_base + "/testing-live/" + $iname + "/latest.zip") end) as $dl_install |
    (if $s != null then ($raw_base + "/stable/" + $iname + "/latest.zip") else ($raw_base + "/testing-live/" + $iname + "/latest.zip") end) as $dl_update |
    (if $t != null then ($raw_base + "/testing-live/" + $iname + "/latest.zip") else ($raw_base + "/stable/" + $iname + "/latest.zip") end) as $dl_testing |

    {
      Author: ($base.Author // ""),
      Name: ($base.Name // $iname),
      Punchline: ($base.Punchline // null),
      Description: ($base.Description // null),
      Changelog: $s_cl,
      TestingChangelog: $t_cl,
      Tags: ($base.Tags // null),
      CategoryTags: ($base.CategoryTags // null),
      IsHide: ($base.IsHide // false),
      InternalName: $iname,
      AssemblyVersion: (if $s != null then $s.AssemblyVersion elif $t != null then $t.AssemblyVersion else "0.0.0.0" end),
      TestingAssemblyVersion: (if $t != null then $t.AssemblyVersion else null end),
      IsTestingExclusive: $is_testing_exclusive,
      RepoUrl: ($base.RepoUrl // null),
      ApplicableVersion: ($base.ApplicableVersion // "any"),
      DalamudApiLevel: (if $s != null then ($s.DalamudApiLevel // 0) elif $t != null then ($t.DalamudApiLevel // 0) else 0 end),
      TestingDalamudApiLevel: (if $t != null then ($t.DalamudApiLevel // 0) else null end),
      DownloadCount: ($base.DownloadCount // 0),
      LastUpdate: $last_update,
      DownloadLinkInstall: $dl_install,
      DownloadLinkUpdate: $dl_update,
      DownloadLinkTesting: $dl_testing,
      LoadPriority: ($base.LoadPriority // 0),
      ImageUrls: ($base.ImageUrls // null),
      IconUrl: ($base.IconUrl // null),
      AcceptsFeedback: ($base.AcceptsFeedback // true),
      FeedbackMessage: ($base.FeedbackMessage // null),
      FeedbackWebhook: ($base.FeedbackWebhook // null),
      _isDip17Plugin: ($base._isDip17Plugin // true),
      _Dip17Channel: (if $s != null then "stable" else "testing-live" end)
    }
  ] | sort_by(.InternalName)
' "$STATE_FILE" $JSON_FILES > "$OUTPUT_FILE"

COUNT=$(jq 'length' "$OUTPUT_FILE")
echo "Successfully generated $OUTPUT_FILE with $COUNT plugins."
echo "Generated $META_FILE with commit metadata."
