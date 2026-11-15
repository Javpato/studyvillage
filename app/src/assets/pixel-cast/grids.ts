/** Hand-authored logical pixels. '.' is transparent; palette letters are material roles.
 * Shared 32×32 canvas, foot pivot (16,26). Top-left lighting. No filtered edges.
 */
export const heads = {
 down: [
 '......oooooo......','....oohhhHHHoo....','...ohhHHHHHHHho...','..ohhHHHHHHHHHho..',
 '..ohHHHHHHHHHHho..','.ohHHHHHHHHHHHHho.','.ohHHHhhHHHhhhHho.',
 '.ohhhsSSsssSSshho.','..ohsSSSSSSSSsho..','.osssSoSSSSoSssso.',
 '.osSsSoSSSSoSsSso.','..ossSSSSSSSSsso..','...osSSSssSSSso...','....ossSSSSsso....','......osssso......'],
 up: [
 '......oooooo......','....oohhhHHHoo....','...ohhHHHHHHHho...','..ohhHHHHHHHHHho..',
 '..ohHHHHHHHHHHho..','.ohHHHHHHHHHHHHho.','.ohHHHHHHHHHHHHho.',
 '.ohHHHHHHHHHHHHho.','..ohHHHHHHHHHHho..','.oshHHHHHHHHHhhso.',
 '.osshhHHHHHHhhSso.','..oshhhhhhhhhhso..','...ohhhhhhhhhho...','....ohhhhhhho.....','......osssso......'],
 right: [
 '.....ooooooo......','...oohhHHHHHoo....','..ohhHHHHHHHHho...','..ohHHHHHHHHHHho..',
 '.ohHHHHHHHHHHHho..','.ohHHHHHHHHHHHho..','.ohHHHHHHHHhhho...',
 '.ohHHHHHHhssSSo...','.ohHHHHHhssSSSo...','.ohhHHHhssSoSSSo..',
 '..ohhhhosSSoSSSso.','...ohhssSSSSSSso..','...ohhssSSSSSso...','....ohhssssso.....','......ossso.......']
};
export const bodies={
 down:['....osssso....','..ooTSSSSToo..','.oLTTToTTTTTo.','oLTTTTWTTTTtto','oTTTTTWTTTTtto','osSTTTWTTTTsso','osSTTTWTTTTsso','.ooTTTWTTTtoo.','..oppppppppo..','..oPPpoPPppo..','..oPPo.oPPpo..','..oooo.ooooo..'],
 up:['....osssso....','..ooTTTTTToo..','.oLTTTTTTTTTo.','oLTTTTTTTTTtto','oTTTTTTTTTTtto','osSTTTTTTTTsso','osSTTTTTTTTsso','.ooTTTTTTTtoo.','..oppppppppo..','..oPPpoPPppo..','..oPPo.oPPpo..','..oooo.ooooo..'],
 right:['....ossso.....','...oTTTTToo...','..oLTTTTTTTo..','..oTTtTTTTTto.','..oTTtTTTTTto.','..oTTtsSTTTto.','..oTTtsSTTTo..','...oTTssTTo...','...opppppo....','...oPPppPo....','...oPPopPoo...','...oooo.ooo...']
};
export const hairParts:Record<string,string[]>={
 long:['ohh.............ho','ohh.............ho','ohh.............ho','ohh.............ho','ohhh...........hho','ohhho.........hhho','.oooo.........ooo.'],
 ponytail:['...ooo','..ohHho','..ohHho','...ohho','...ohho','....oo'],
 bun:['.oooo.','ohHHho','ohHHho','.ohho.'],
 curly:['..oo..ooo..oo..','oohHooHHHooHHoo','ohHHHHHHHHHHHho','.hHHHHHHHHHHHh.'],
 spiky:['.....o....o.....','..o.ohho.ohho...','.ohooHHhoHHHhoo.','ohHHHHHHHHHHHHho']
};
export const hats:Record<string,string[]>={
 cap:['.....ooooooo.....','...ooaaaaAAAoo...','..oaAAAAAAAAAao..','.oaAAAAAAAAAAaao.','.oaaaaaaaaaaaaao.','..ooooooooooooooo'],
 beanie:['......ooooo......','....ooAAAAAoo....','...oAAAAAAAAAo...','..oAAAAAAAAAAAo..','..oaaaaaaaaaaao..','..oAaAaAaAaAaAo..','...ooooooooooo...'],
 beret:['....oooooooo.....','..ooAAAAAAAAoo...','.oAAAAAAAAAAAAo..','.oAAAAAAAAAAAao..','..oaaaaaaaaaao...','...oooooooooo....'],
 explorer:['.....ooooooo.....','....oAAAAAAAao...','...oAAAAAAAAAao..','...oaaaaaaaaaao..','.ooAAAAAAAAAAAoo.','oAAAAAAAAAAAAAAAo','.ooooooooooooooo.'],
 crown:['..o....o....o....','..oA..oAo..oAo...','..oAooAAAooAAo...','..oAAAAAAAAAAo...','..oaaAaaaAaaao...','...oooooooooo....']
};
export const clothes:Record<string,string[]>={
 hoodie:['..tt.....tt..','...tt...tt...','....tooot....','....t...t....','.............','....ttttt....','....tTTTt....'],
 suit:['..WW.....WW..','...WW.o.WW...','....W.o.W....','.....WoW.....','......o......','......o......','......o......'],
 overalls:['..pp.....pp..','..pP.....Pp..','..pPpppppPp..','..pPPPPPPPp..','..pPPpPpPPp..','..pPPpppPPp..','..pPPPPPPPp..'],
 sporty:['..WW.....WW..','..WW.....WW..','..WW.....WW..','..WW.....WW..','.............','...WWWWWWW...'],
 dress:['.............','.............','.............','.............','..ttttttttt..','..tTTTTTTTt..','.tTTTTTTTTTt.','otTTTTTTTTTto','ooooooooooooo']
};
export const jackets:Record<string,string[]>={
 cardigan:['.jjj.....jjj.','.jJJj...jJJj.','.jJJj...jJJj.','.jJJj...jJJj.','.jJJj...jJJj.','.jJJj...jJJj.','.jjjj...jjjj.'],
 blazer:['.jjj.....jjj.','.jJWj...jWJj.','.jJJWj.jWJJj.','.jJJJj.jJJJj.','.jJJJj.jJJJj.','.jJJJj.jJJJj.','.jjjj...jjjj.'],
 coat:['.jjj.....jjj.','.jJJj...jJJj.','.jJJj...jJJj.','.jJJj...jJJj.','.jJJj...jJJJj.','.jJJj...jJJJj.','.jJJj...jJJJj.','.jJJj...jJJJj.','.jjjj...jjjj.']
};
export const glasses:Record<string,string[]>={
 round:['.ooo..ooo.','o...oo...o','.ooo..ooo.'],square:['oooo..oooo','o..oooo..o','oooo..oooo'],sunglasses:['oooo..oooo','oWoooooooo','.ooo..ooo.']
};
