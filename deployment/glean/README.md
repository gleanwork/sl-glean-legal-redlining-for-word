# Glean Agent Configuration Templates

This folder contains template files and agent instructions for the three Glean agents required by the Word Add-in. All files are in the `agents/` subfolder.

## Required Agents

### 1. Chat Agent (`agents/chat-agent-template.json`)
- **Purpose**: Legal Q&A assistant for answering questions about contracts
- **Used by**: Chat feature in the Word Add-in
- **Setup**: Follow instructions in the template file to create in your Glean instance

### 2. Redliner Agent (`agents/redliner-agent-template.json`)
- **Purpose**: Contract analysis and tracked change recommendations
- **Used by**: Playbook Review feature
- **Setup**: Follow instructions in the template file to create in your Glean instance

### 3. Listing Agent (`agents/listing-agent-template.json`)
- **Purpose**: Retrieve available templates and playbooks from your data sources
- **Used by**: Template/Playbook selection dropdowns
- **Setup**: Follow instructions in the template file to create in your Glean instance

## How to Use These Templates

1. **Review each template file** - They contain placeholder configurations and setup instructions
2. **Create agents in your Glean instance** - Follow the step-by-step instructions in each template
3. **Export your actual agent configurations** - Replace these templates with your real configs (optional)
4. **Copy the Agent IDs** - You'll need these for configuring the Word Add-in

## Auto Mode Agent Instructions

The `agents/` folder contains system prompt instructions for each agent. Copy the contents of the relevant `.md` file into the agent's instruction field in Glean when configuring as an auto mode agent.

### Redliner Agent

Versioned instruction sets — use the latest (`v4`):

- `redliner-automode-instruction.md` — Original instruction set
- `redliner-automode-instruction-v2.md` — Added atomicity rules
- `redliner-automode-instruction-v3.md` — Added anti-duplicate enforcement
- `redliner-automode-instruction-v4.md` — **Latest**: anti-no-op, contiguous text, no-ellipsis rules

### Listing Agent

- `listing-automode-instruction.md` — Retrieves templates/playbooks from configured folders, returns JSON

**Setup:** Before pasting the instructions, replace `YOUR_TEMPLATES_FOLDER_URL` and `YOUR_PLAYBOOKS_FOLDER_URL` with the actual URLs of your Google Drive (or SharePoint, etc.) folders containing your contract templates and playbooks. Ensure the agent has the **Document Reader** tool enabled.

### Chat Agent

- `chat-automode-instruction.md` — Contract Q&A assistant, answers questions grounded in the document text

**Setup:** Paste the instructions as-is. The add-in sends the user's question along with the contract text in `<<<DOCUMENT>>>...<<<END_DOCUMENT>>>` delimiters. The agent answers based on the document content.

## Important Notes

- These are **template files** — you must create the actual agents in your Glean instance
- The **Listing Agent template** contains `REDACTED_URL` placeholders in its `instructionTemplate` fields. You must replace these with URLs pointing to your own document source folders (Google Drive, SharePoint, etc.) where your contract templates and playbooks are stored.
- Each template includes detailed setup instructions
- After creating agents, note the Agent IDs for use in the Word Add-in Settings screen or `prod.env`
- The actual agent configurations are managed in the Glean platform
- These files are for reference and documentation purposes
