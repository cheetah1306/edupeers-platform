-- =============================================
-- Peers Connect Additional Schema
-- Run this to add peers_connections, peer_messages,
-- and peer_shared_resources tables
-- =============================================

-- Connection requests & accepted connections
CREATE TABLE IF NOT EXISTS peer_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_connections_requester ON peer_connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_peer_connections_addressee ON peer_connections(addressee_id, status);

-- Direct messages between connected peers
CREATE TABLE IF NOT EXISTS peer_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_peer_messages_pair ON peer_messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_peer_messages_pair_rev ON peer_messages(receiver_id, sender_id);

-- Shared resources in the Peers Connect vault
CREATE TABLE IF NOT EXISTS peer_resources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    file_name   VARCHAR(255),
    file_type   VARCHAR(100),
    file_data   TEXT,      -- base64 data URL for small files
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_peer_resources_author ON peer_resources(author_id);
