#!/bin/sh
# ==============================================================================
# generate_repo.sh
#
# POSIX Shell script to scan stable/ and testing-live/ plugin directories along
# with state.json, and generate PluginMaster/repo.json for GitHub Pages.
#
# Requirements: jq (pre-installed on macOS / Linux)
# Usage: ./generate_repo.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/state.json"
OUTPUT_DIR="$SCRIPT_DIR/PluginMaster"
OUTPUT_FILE="$OUTPUT_DIR/repo.json"

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

# Execute single-pass jq aggregation
jq -s '
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
      DownloadLinkInstall: ("https://kamori.goats.dev/Plugin/Download/" + $iname + "?isUpdate=False&isTesting=False&branch=api9&isDip17=True"),
      DownloadLinkUpdate: ("https://raw.githubusercontent.com/goatcorp/DalamudPlugins/api9/plugins/" + $iname + "/latest.zip"),
      DownloadLinkTesting: ("https://kamori.goats.dev/Plugin/Download/" + $iname + "?isUpdate=False&isTesting=True&branch=api9&isDip17=True"),
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
