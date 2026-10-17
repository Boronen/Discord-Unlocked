import { expect, test } from "vitest";
import { profilePatches } from "../packages/plugin/patches";

function apply(find: string, source: string) {
  const patch = profilePatches.find((item) => item.find === find)!;
  const replacements = Array.isArray(patch.replacement) ? patch.replacement : [patch.replacement];
  for (const replacement of replacements) {
    const match = replacement.match as RegExp;
    // Vencord expands its documented identifier placeholder before patching.
    const regex = new RegExp(match.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)"), match.flags);
    expect(regex.test(source)).toBe(true);
    source = source.replace(regex, (replacement.replace as string).replaceAll("$self", "plugin"));
  }
  expect(() => new Function(source)).not.toThrow();
  return source;
}

test.each(["decoration", "[voiceIndicator(),decoration]"])(
  "mounts a profile observer with existing trailing content %s",
  (trailing) => {
    const source = `function Header(props){let{user:u}=props;return(0,r.jsxs)("div",{children:[(0,r.jsx)(DisplayName,{user:u,guildId:g,displayName:n,size:s,pendingDisplayNameStyles:p,onClickDisplayName:c,trailing:${trailing}}),(0,r.jsx)(Username,{user:u})]})}`;
    const result = apply("#{intl::USER_PROFILE_PRONOUNS}", source);
    expect(result).toContain("children:[plugin.ProfileAttachment({userId:u.id}),");
    expect(result).toContain(`trailing:${trailing}`);
  },
);

test("patches the current decoration hook and tracks the memo dependency", () => {
  const result = apply(
    "isAvatarDecorationAnimating:",
    "function hook(e){let{user:t,guildId:n,size:s,avatarDecorationOverride:E}=e,T=wrap(resolve({userValue:t?.avatarDecoration,guildValue:p?.avatarDecoration,guildId:n})),m=other(),g=r.useMemo(()=>m||url({avatarDecoration:void 0!==E?E:T,canAnimate:I,size:s}),[m,E,T,I,s]);return{avatarDecorationSrc:g,isAvatarDecorationAnimating:I}}",
  );
  expect(result).toContain("psDecoration=plugin.useDecoration(t)");
  expect(result).toContain("avatarDecoration:psDecoration??(void 0!==E?E:T)");
  expect(result).toContain("[psDecoration,m,E,T,I,s]");
});

test.each(["", "const decor=existing(arguments[0]);if(decor)return decor;"])(
  "patches decoration URL resolution with another plugin preamble %s",
  (preamble) => {
    const result = apply(
      "getAvatarDecorationURL:",
      `function url(e){${preamble}let{avatarDecoration:t,size:s=D.DEFAULT,canAnimate:a=!1}=e;if(null==t)return null;return t.asset}`,
    );
    expect(result).toContain("const psUrl=plugin.decorationUrl(arguments[0]);if(psUrl)return psUrl;");
  },
);
