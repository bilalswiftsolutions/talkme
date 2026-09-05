const { useEffect, useRef, useState } = React;

const CALL_HISTORY_KEY = 'talkme.callHistory';

function saveCallHistory(roomId, name, participant) {
    try {
        const history = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || '[]');
        const current = history.find(item => item.roomId === roomId) || { roomId };
        const entry = { ...current, name, participant: participant || current.participant || '', lastJoined: Date.now() };
        localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify([entry, ...history.filter(item => item.roomId !== roomId)].slice(0, 12)));
    } catch (err) { }
}

const icons = {
    mic: '<rect x="9" y="2" width="6" height="11" rx="3"></rect><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"></path>',
    micOff: '<path d="m3 3 18 18M9 9v4a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.12-2.12M5 10a7 7 0 0 0 11.12 5.66M12 17v5M8 22h8"></path>',
    camera: '<path d="m16 10 5-3v10l-5-3z"></path><rect x="3" y="6" width="13" height="12" rx="2"></rect>',
    cameraOff: '<path d="m3 3 18 18M10.5 6H16a2 2 0 0 1 2 2v3l3-2v10l-3-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5"></path>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"></path>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"></path>'
};

function Icon({ name }) {
    return React.createElement('svg', { className: 'control-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: icons[name] } });
}

function CallApp({ roomId, autoJoin }) {
    const roomUrl = `${window.location.origin}/rooms/${roomId}`;
    const localVideo = useRef(null);
    const remoteVideo = useRef(null);
    const peer = useRef(null);
    const socket = useRef(null);
    const stream = useRef(null);
    const pendingCandidates = useRef([]);
    const controlsTimer = useRef(null);
    const stage = useRef(null);
    const drag = useRef({ active: false, moved: false });
    const [connected, setConnected] = useState(false);
    const [displayName, setDisplayName] = useState(() => localStorage.getItem('talkme.name') || '');
    const [remoteName, setRemoteName] = useState('');
    const [started, setStarted] = useState(() => autoJoin && Boolean(localStorage.getItem('talkme.name')));
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [copied, setCopied] = useState(false);
    const shareHintKey = `talkme.shareHintSeen.${roomId}`;
    const [shareHintVisible, setShareHintVisible] = useState(() => autoJoin && window.innerWidth <= 720 && localStorage.getItem(shareHintKey) !== 'true');
    const [controlsVisible, setControlsVisible] = useState(true);
    const [localIsMain, setLocalIsMain] = useState(false);
    const [previewPosition, setPreviewPosition] = useState(null);

    useEffect(() => {
        if (!started || !displayName) return undefined;
        saveCallHistory(roomId, displayName);
        let active = true;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        socket.current = new WebSocket(`${protocol}://${window.location.host}/signal?room=${roomId}`);
        socket.current.onopen = async () => {
            try {
                stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (active && localVideo.current) localVideo.current.srcObject = stream.current;
                if (active) send({ type: 'join', name: displayName });
            } catch (err) { }
        };
        socket.current.onmessage = async ({ data }) => {
            const message = JSON.parse(data);
            if (message.type === 'name') {
                setRemoteName(message.name || 'Guest');
                saveCallHistory(roomId, displayName, message.name || 'Guest');
            } else if (message.type === 'peer-joined') {
                setRemoteName(message.name || 'Guest');
                saveCallHistory(roomId, displayName, message.name || 'Guest');
                await makeOffer();
            } else if (message.type === 'peer-left') {
                stream.current?.getTracks().forEach(track => track.stop());
                peer.current?.close();
                window.location.href = '/';
            } else if (message.type === 'offer') {
                await ensurePeer();
                if (peer.current.signalingState !== 'stable') return;
                await peer.current.setRemoteDescription(message.offer);
                await flushCandidates();
                const answer = await peer.current.createAnswer();
                await peer.current.setLocalDescription(answer);
                send({ type: 'answer', answer });
            } else if (message.type === 'answer' && peer.current?.signalingState === 'have-local-offer') {
                await peer.current.setRemoteDescription(message.answer);
                await flushCandidates();
            } else if (message.type === 'candidate' && message.candidate) {
                if (peer.current?.remoteDescription) await peer.current.addIceCandidate(message.candidate);
                else pendingCandidates.current.push(message.candidate);
            }
        };
        socket.current.onclose = () => active && setConnected(false);
        return () => {
            active = false;
            stream.current?.getTracks().forEach(track => track.stop());
            peer.current?.close();
            peer.current = null;
            pendingCandidates.current = [];
            socket.current?.close();
            socket.current = null;
        };
    }, [roomId, started, displayName]);

    useEffect(() => {
        if (!started) return undefined;
        if (autoJoin) window.history.replaceState({}, document.title, `/rooms/${roomId}`);
        revealControls();
        return () => clearTimeout(controlsTimer.current);
    }, [started]);

    async function ensurePeer() {
        if (peer.current) return;
        peer.current = new RTCPeerConnection({
            iceServers: [
                {
                    urls: [
                        'turn:turn.talkme.bilalarshad.pro:3478?transport=udp',
                        'turn:turn.talkme.bilalarshad.pro:3478?transport=tcp'
                    ],
                    username: 'talkme',
                    credential: 'FVzFo1AwV6x5goeCiJMFCRJqfNZqb5jJATTCyLqyxWo'
                }
            ]
        });
        stream.current?.getTracks().forEach(track => peer.current.addTrack(track, stream.current));
        peer.current.ontrack = event => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; setConnected(true); };
        peer.current.onicecandidate = event => event.candidate && send({ type: 'candidate', candidate: event.candidate });
    }
    async function flushCandidates() {
        const candidates = pendingCandidates.current.splice(0);
        for (const candidate of candidates) await peer.current?.addIceCandidate(candidate);
    }
    async function makeOffer() {
        await ensurePeer();
        if (peer.current.signalingState !== 'stable') return;
        const offer = await peer.current.createOffer();
        if (peer.current.signalingState !== 'stable') return;
        await peer.current.setLocalDescription(offer);
        send({ type: 'offer', offer });
    }
    function send(message) { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message)); }
    function toggleAudio() { const nextMuted = !muted; stream.current?.getAudioTracks().forEach(track => track.enabled = !nextMuted); setMuted(nextMuted); }
    function toggleCamera() { const nextOff = !cameraOff; stream.current?.getVideoTracks().forEach(track => track.enabled = !nextOff); setCameraOff(nextOff); }
    async function shareScreen() {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const sender = peer.current?.getSenders().find(item => item.track?.kind === 'video');
        if (sender) sender.replaceTrack(screen.getVideoTracks()[0]);
        screen.getVideoTracks()[0].onended = () => sender?.replaceTrack(stream.current?.getVideoTracks()[0]);
    }
    async function copyLink() { await navigator.clipboard.writeText(roomUrl); localStorage.setItem(shareHintKey, 'true'); setShareHintVisible(false); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    function leave() {
        send({ type: 'leave' });
        stream.current?.getTracks().forEach(track => track.stop());
        peer.current?.close();
        socket.current?.close();
        window.location.href = '/';
    }
    function revealControls() { setControlsVisible(true); clearTimeout(controlsTimer.current); controlsTimer.current = setTimeout(() => setControlsVisible(false), 5000); }
    function startPreviewDrag(event) {
        event.preventDefault();
        event.stopPropagation();
        const stageBox = stage.current.getBoundingClientRect();
        const tileBox = event.currentTarget.getBoundingClientRect();
        drag.current = { active: true, moved: false, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - tileBox.left, offsetY: event.clientY - tileBox.top, stageBox, tileWidth: tileBox.width, tileHeight: tileBox.height };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function movePreview(event) {
        if (!drag.current.active) return;
        event.preventDefault();
        const { stageBox, tileWidth, tileHeight, offsetX, offsetY, startX, startY } = drag.current;
        const left = Math.max(8, Math.min(event.clientX - stageBox.left - offsetX, stageBox.width - tileWidth - 8));
        const top = Math.max(8, Math.min(event.clientY - stageBox.top - offsetY, stageBox.height - tileHeight - 8));
        if (Math.abs(event.clientX - startX) > 4 || Math.abs(event.clientY - startY) > 4) drag.current.moved = true;
        setPreviewPosition({ left, top });
    }
    function endPreviewDrag(event) {
        event.preventDefault();
        drag.current.active = false;
    }
    function previewStyle(isSmallVideo) {
        if (!isSmallVideo || window.innerWidth > 720) return undefined;
        if (previewPosition) return { left: `${previewPosition.left}px`, top: `${previewPosition.top}px`, right: 'auto', bottom: 'auto' };
        return { bottom: controlsVisible ? '84px' : '16px' };
    }
    function swapVideos() {
        if (drag.current.moved) { drag.current.moved = false; return; }
        setLocalIsMain(current => !current);
        setPreviewPosition(null);
    }
    function joinWithName(event) { event.preventDefault(); const name = displayName.trim(); if (!name) return; localStorage.setItem('talkme.name', name); setDisplayName(name); setStarted(true); }

    if (!started) return React.createElement('main', { className: 'name-gate' },
        React.createElement('div', { className: 'name-card' },
            React.createElement('a', { className: 'brand', href: '/' }, React.createElement('span', { className: 'brand-mark' }, 't'), ' talkme'),
            React.createElement('p', { className: 'eyebrow' }, 'Before you join'),
            React.createElement('h1', null, 'What should we call you?'),
            React.createElement('p', { className: 'name-help' }, 'Choose the name others will see in this call.'),
            React.createElement('form', { className: 'name-form', onSubmit: joinWithName },
                React.createElement('label', { htmlFor: 'room-display-name' }, 'Your name'),
                React.createElement('input', { id: 'room-display-name', value: displayName, onChange: event => setDisplayName(event.target.value), maxLength: 40, placeholder: 'Enter your name', autoComplete: 'name', autoFocus: true, required: true }),
                React.createElement('button', { className: 'primary-button', type: 'submit' }, 'Join call ', React.createElement('span', { 'aria-hidden': 'true' }, '\u2192'))
            )
        )
    );

    return React.createElement('div', { className: 'room-shell', onPointerDown: revealControls },
        React.createElement('header', { className: 'room-top' }, React.createElement('a', { className: 'brand', href: '/' }, React.createElement('span', { className: 'brand-mark' }, 't'), ' talkme'), React.createElement('div', { className: 'room-top-actions' }, React.createElement('button', { className: 'pwa-install-button', type: 'button', hidden: true }, 'Install app'), React.createElement('div', { className: 'room-status' }, React.createElement('span', { className: 'status-dot' }), connected ? 'connected' : 'waiting for someone'))),
        React.createElement('section', { className: 'stage', ref: stage },
            React.createElement('div', { className: `video-tile remote-video ${localIsMain ? 'small-video' : 'main-video'}`, style: previewStyle(localIsMain), onClick: localIsMain ? swapVideos : undefined, onPointerDown: localIsMain ? startPreviewDrag : undefined, onPointerMove: localIsMain ? movePreview : undefined, onPointerUp: localIsMain ? endPreviewDrag : undefined, onPointerCancel: localIsMain ? endPreviewDrag : undefined, onLostPointerCapture: localIsMain ? endPreviewDrag : undefined }, React.createElement('video', { ref: remoteVideo, autoPlay: true, playsInline: true }), !connected && React.createElement('div', { className: 'video-empty' }, 'waiting for someone'), React.createElement('span', { className: 'video-label' }, remoteName || 'Guest')),
            React.createElement('div', { className: `video-tile local-video ${localIsMain ? 'main-video' : 'small-video'}`, style: previewStyle(!localIsMain), onClick: !localIsMain ? swapVideos : undefined, onPointerDown: !localIsMain ? startPreviewDrag : undefined, onPointerMove: !localIsMain ? movePreview : undefined, onPointerUp: !localIsMain ? endPreviewDrag : undefined, onPointerCancel: !localIsMain ? endPreviewDrag : undefined, onLostPointerCapture: !localIsMain ? endPreviewDrag : undefined }, React.createElement('video', { ref: localVideo, autoPlay: true, muted: true, playsInline: true }), React.createElement('span', { className: 'video-label' }, displayName)),
            shareHintVisible && React.createElement('div', { className: `mobile-share-hint ${controlsVisible ? '' : 'hint-hidden'}` }, 'Copy the link below to invite someone'),
            React.createElement('div', { className: `controls ${controlsVisible ? 'controls-visible' : 'controls-hidden'}` },
                React.createElement('button', { className: `control-button ${muted ? 'active' : ''}`, onClick: toggleAudio, title: muted ? 'Unmute microphone' : 'Mute microphone', 'aria-label': muted ? 'Unmute microphone' : 'Mute microphone' }, React.createElement(Icon, { name: muted ? 'micOff' : 'mic' })),
                React.createElement('button', { className: `control-button ${cameraOff ? 'active' : ''}`, onClick: toggleCamera, title: cameraOff ? 'Turn camera on' : 'Turn camera off', 'aria-label': cameraOff ? 'Turn camera on' : 'Turn camera off' }, React.createElement(Icon, { name: cameraOff ? 'cameraOff' : 'camera' })),
                React.createElement('button', { className: 'control-button', onClick: shareScreen, title: 'Share your screen', 'aria-label': 'Share your screen' }, React.createElement(Icon, { name: 'share' })),
                React.createElement('button', { className: 'control-button mobile-copy-control', onClick: copyLink, title: copied ? 'Copied' : 'Copy link', 'aria-label': copied ? 'Copied' : 'Copy link' }, React.createElement(Icon, { name: 'copy' })),
                React.createElement('button', { className: 'control-button end', onClick: leave, title: 'Leave call', 'aria-label': 'Leave call' }, React.createElement(Icon, { name: 'phone' }))
            )
        ),
        React.createElement('div', { className: 'invite-row' }, React.createElement('div', { className: 'invite-link' }, roomUrl), React.createElement('button', { className: 'copy-button', onClick: copyLink }, copied ? 'copied' : 'copy link'))
    );
}

const root = document.getElementById('call-app');
ReactDOM.createRoot(root).render(React.createElement(CallApp, { roomId: root.dataset.roomId, autoJoin: root.dataset.autoJoin === 'true' }));
