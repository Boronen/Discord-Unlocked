import type { Patch } from "@utils/types";

export const profilePatches: Omit<Patch, "plugin">[] = [
  {
    find: ".size-1.375*",
    replacement: {
      match: /(?<=function(?: \i)?\((\i)(?:,\i)?\)\{)(?=let\{[^}]*\bsize[:},])/,
      replace: "$1=$self.useAvatarProps($1);",
    },
  },
  {
    find: "#{intl::USER_PROFILE_PRONOUNS}",
    replacement: {
      // Attach as a separate child: UserVoiceShow also rewrites trailing content.
      match: /(?<=children:\[)(?=\(0,\i\.jsx\)\(\i,\{user:(\i),guildId:\i,displayName:)/,
      replace: "$self.ProfileAttachment({userId:$1.id}),",
    },
  },
  {
    find: "UserProfileStore",
    replacement: {
      match: /(?<=getUserProfile\(\i\)\{return )(.+?)(?=\})/,
      replace: "$self.patchProfile($1)",
    },
  },
  {
    find: ':"SHOULD_LOAD");',
    replacement: {
      match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
      replace: "$self.bannerUrl(arguments[0])||$&",
    },
  },
  {
    find: "isAvatarDecorationAnimating:",
    group: true,
    replacement: [
      {
        match: /(?<=\.avatarDecoration,guildId:\i\}\)\),)(?<=user:(\i).+?)/,
        replace: "psDecoration=$self.useDecoration($1),",
      },
      {
        // Discord now uses an explicit undefined check instead of E??T.
        match: /(?<=avatarDecoration:)(void 0!==\i\?\i:\i)(?=,canAnimate:)/,
        replace: "psDecoration??($1)",
      },
      {
        match: /(?<=size:\i\}\),\[)/,
        replace: "psDecoration,",
      },
    ],
  },
  {
    find: "getAvatarDecorationURL:",
    replacement: {
      // Match the argument destructuring even when Decor inserted a preamble.
      match: /let\{avatarDecoration:\i,size:[^}]+\}=\i;/,
      replace: "$&const psUrl=$self.decorationUrl(arguments[0]);if(psUrl)return psUrl;",
    },
  },
];
