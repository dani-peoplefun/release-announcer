const { WebClient } = require('@slack/web-api');
require('dotenv').config();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests'
    });
  }

  try {
    // Helper function to get all pages of channels
    async function getAllChannels(types, includeArchived = false) {
      let allChannels = [];
      let cursor = undefined;
      let pageCount = 0;
      
      do {
        pageCount++;
        const response = await slack.conversations.list({
          types: types,
          exclude_archived: !includeArchived,
          limit: 1000, // Max per request
          cursor: cursor
        });
        
        if (response.ok && response.channels) {
          allChannels.push(...response.channels);
          cursor = response.response_metadata?.next_cursor;
        } else {
          console.warn(`Failed to get ${types} channels:`, response.error);
          break;
        }
      } while (cursor);
      
      return { channels: allChannels, pages: pageCount, ok: true };
    }

    // Get all channels with pagination - including archived ones for complete search
    const [publicChannels, privateChannels, dms] = await Promise.all([
      getAllChannels('public_channel', true),
      getAllChannels('private_channel', true), 
      getAllChannels('im,mpim', true)
    ]);

    const allChannels = [
      ...publicChannels.channels,
      ...privateChannels.channels,
      ...dms.channels
    ];

    // Format the response
    const channelInfo = allChannels.map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.is_private ? 'private' : 
            channel.is_im ? 'dm' : 
            channel.is_mpim ? 'group_dm' : 'public',
      is_member: channel.is_member,
      is_archived: channel.is_archived,
      num_members: channel.num_members
    }));

    // Search for the specific channel
    const searchTerm = req.query.search;
    let matchingChannels = [];
    if (searchTerm) {
      matchingChannels = channelInfo.filter(c => 
        c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return res.status(200).json({
      success: true,
      bot_info: {
        can_list_public: publicChannels.ok,
        can_list_private: privateChannels.ok,
        can_list_dms: dms.ok
      },
      summary: {
        total_channels: channelInfo.length,
        public_channels: channelInfo.filter(c => c.type === 'public').length,
        private_channels: channelInfo.filter(c => c.type === 'private').length,
        bot_is_member_of: channelInfo.filter(c => c.is_member).length
      },
      search_results: searchTerm ? {
        search_term: searchTerm,
        matches_found: matchingChannels.length,
        matches: matchingChannels
      } : null,
      all_channels: channelInfo.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      usage: {
        list_all: '/api/debug-channels',
        search: '/api/debug-channels?search=dani'
      }
    });

  } catch (error) {
    console.error('Debug channels error:', error);
    return res.status(500).json({
      error: 'Slack API error',
      message: error.message,
      details: error.data || null
    });
  }
}; 