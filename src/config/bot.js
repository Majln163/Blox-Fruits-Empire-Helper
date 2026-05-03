const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

const invites = new Map();
const inviteCounts = new Map();

client.once('ready', async () => {
  client.guilds.cache.forEach(async (guild) => {
    const guildInvites = await guild.invites.fetch();
    invites.set(guild.id, guildInvites);
  });
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;

  const oldInvites = invites.get(guild.id);
  const newInvites = await guild.invites.fetch();
  invites.set(guild.id, newInvites);

  const usedInvite = newInvites.find(inv =>
    oldInvites.get(inv.code)?.uses < inv.uses
  );

  const inviter = usedInvite?.inviter  null;

  if (inviter) {
    inviteCounts.set(inviter.id, (inviteCounts.get(inviter.id) 
 0) + 1);
  }

  const inviterCount = inviter ? inviteCounts.get(inviter.id) : 0;

  // 🎨 Create canvas
  const canvas = createCanvas(800, 250);
  const ctx = canvas.getContext('2d');

  // Background (you can replace with your own image)
  const background = await loadImage('https://i.imgur.com/yourBackground.png');
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Avatar
  const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png' }));
  ctx.save();
  ctx.beginPath();
  ctx.arc(125, 125, 70, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 55, 55, 140, 140);
  ctx.restore();

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "28px sans-serif";
  ctx.fillText(Welcome ${member.user.username}, 220, 100);ctx.font = "20px sans-serif";
  ctx.fillText(Invited by: ${inviter ? inviter.tag : "Unknown"}, 220, 140);
  ctx.fillText(Inviter invites: ${inviterCount}, 220, 170);
  ctx.fillText(Member #${guild.memberCount}, 220, 200);

  const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome.png' });

  const channel = guild.channels.cache.find(c => c.name === "welcome");
  if (!channel) return;

  channel.send({ files: [attachment] });
});

client.login("MTUwMDU1NzQ2MDI3NTIwNDIwNg.GEikwz.85a_Osp-Gik9ZEMZ92HwkkTiKvpOimhCi7n0eI");
