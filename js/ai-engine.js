class AIEngine {
  analyzeMeeting(transcript, segments, language = 'English') {
    const decisions = this.extractDecisions(segments);
    const actionItems = this.extractActionItems(segments);
    const risks = this.extractRisks(segments);
    const openQuestions = this.extractOpenQuestions(segments);
    const keyPoints = this.extractKeyPoints(segments);
    
    return {
      executiveSummary: this.buildExecutiveSummary(decisions, actionItems, keyPoints, language),
      keyDiscussionPoints: keyPoints,
      decisions,
      actionItems,
      risks,
      openQuestions,
      followUpItems: this.extractFollowUpItems(segments),
      unresolvedIssues: this.extractUnresolvedIssues(segments),
      importantQuotes: this.extractImportantQuotes(segments),
      generatedAt: new Date().toISOString(),
      outputLanguage: language
    };
  }

  extractDecisions(segments) {
    const patterns = [
      { pattern: /we agree|we decided|approved|confirmed|final decision|settled on/i, confidence: 'High' },
      { pattern: /kita sepakat|kita setuju|disetujui|diputuskan|dikonfirmasi/i, confidence: 'High' },
      { pattern: /我们同意|批准|确认/i, confidence: 'High' },
      { pattern: /let's go with|we will use/i, confidence: 'Medium' },
      { pattern: /决定/i, confidence: 'Medium' }
    ];
    
    const proposalPatterns = /i think|i suggest|maybe|perhaps|menurut saya|mungkin|我觉得|也许|可能/i;
    
    const decisions = [];
    segments.forEach(seg => {
      const text = seg.text.toLowerCase();
      patterns.forEach(({ pattern, confidence }) => {
        if (pattern.test(text)) {
          const isProposal = proposalPatterns.test(text);
          const finalConfidence = isProposal && confidence === 'High' ? 'Medium' : confidence;
          decisions.push({
            id: crypto.randomUUID(),
            title: this.extractTitle(seg.text),
            description: seg.text,
            confidence: finalConfidence,
            evidence: {
              transcriptSnippet: seg.text,
              timestamp: seg.startTime,
              speaker: seg.speaker
            },
            status: 'Confirmed',
            relatedDecisions: []
          });
        }
      });
    });
    return this.deduplicate(decisions, 'evidence.transcriptSnippet');
  }

  extractActionItems(segments) {
    const patterns = [
      { pattern: /please (prepare|send|review)|will (handle|prepare|send|coordinate)|is responsible for/i, confidence: 'High' },
      { pattern: /tolong (siapkan|kirim)|akan (menangani|menyiapkan|mengkoordinasi)|bertanggung jawab/i, confidence: 'High' },
      { pattern: /请(准备|发送|审查)|将(处理|准备)|负责/i, confidence: 'High' }
    ];
    
    const suggestionPatterns = /maybe|perhaps|could|mungkin|sebaiknya|也许|可能/i;
    const actionItems = [];
    
    segments.forEach(seg => {
      const text = seg.text.toLowerCase();
      patterns.forEach(({ pattern, confidence }) => {
        if (pattern.test(text)) {
          const isSuggestion = suggestionPatterns.test(text);
          actionItems.push({
            id: crypto.randomUUID(),
            task: this.extractTask(seg.text),
            pic: this.extractPIC(seg.text) || 'Needs Review',
            deadline: this.extractDeadline(seg.text),
            status: 'Pending',
            confidence: isSuggestion ? 'Low' : confidence,
            evidence: {
              transcriptSnippet: seg.text,
              timestamp: seg.startTime,
              speaker: seg.speaker
            },
            isManuallyAdded: false
          });
        }
      });
    });
    return actionItems;
  }

  extractRisks(segments) {
    const patterns = [
      { pattern: /risk|concern|worried|problem|issue|delay|over budget|might fail|critical/i, severity: 'Medium' },
      { pattern: /resiko|khawatir|masalah|terlambat/i, severity: 'Medium' },
      { pattern: /风险|担心|问题|延迟/i, severity: 'Medium' }
    ];
    
    const risks = [];
    segments.forEach(seg => {
      const text = seg.text.toLowerCase();
      patterns.forEach(({ pattern, severity }) => {
        if (pattern.test(text)) {
          let sev = severity;
          if (/critical|kritis|严重/i.test(text)) sev = 'Critical';
          else if (/high|tinggi|高/i.test(text)) sev = 'High';
          risks.push({
            id: crypto.randomUUID(),
            description: seg.text,
            severity: sev,
            evidence: {
              transcriptSnippet: seg.text,
              timestamp: seg.startTime,
              speaker: seg.speaker
            }
          });
        }
      });
    });
    return risks;
  }

  extractOpenQuestions(segments) {
    return segments
      .filter(s => s.text.trim().endsWith('?') || s.text.trim().endsWith('？'))
      .map(s => s.text);
  }

  extractKeyPoints(segments) {
    const indicators = /discuss|talk about|review|consider|bahas|diskusi|tinjau|讨论|谈谈|审查/i;
    const points = [];
    segments.forEach(seg => {
      if (indicators.test(seg.text.toLowerCase())) {
        if (!points.includes(seg.text)) points.push(seg.text);
      }
    });
    return points.slice(0, 10);
  }

  extractFollowUpItems(segments) {
    const patterns = /follow up|next time|next meeting|lain kali|pertemuan berikutnya|下次|跟进/i;
    return segments.filter(s => patterns.test(s.text.toLowerCase())).map(s => s.text);
  }

  extractUnresolvedIssues(segments) {
    const patterns = /not resolved|still open|pending|unclear|belum selesai|masih terbuka|未解决|不清楚/i;
    return segments.filter(s => patterns.test(s.text.toLowerCase())).map(s => s.text);
  }

  extractImportantQuotes(segments) {
    const patterns = /important|critical|key point|remember|penting|kritis|poin utama|重要|关键|记住/i;
    return segments
      .filter(s => patterns.test(s.text.toLowerCase()))
      .map(s => ({
        id: crypto.randomUUID(),
        text: s.text,
        speaker: s.speaker,
        timestamp: s.startTime,
        context: 'Important'
      }));
  }

  buildExecutiveSummary(decisions, actionItems, keyPoints, language) {
    const d = decisions.length;
    const a = actionItems.length;
    const k = keyPoints.length;
    
    if (language === 'Indonesian') {
      return `Ringkasan Meeting:\n- ${d} keputusan dicatat\n- ${a} action item ditugaskan\n- ${k} poin diskusi utama`;
    }
    if (language === 'Mandarin') {
      return `会议摘要：\n- ${d} 项决定\n- ${a} 个行动项目\n- ${k} 个主要讨论点`;
    }
    return `Meeting Summary:\n- ${d} decision(s) recorded\n- ${a} action item(s) assigned\n- ${k} key discussion point(s)`;
  }

  extractTitle(text) {
    const sentences = text.split(/[.!?。！？]/);
    const first = sentences[0]?.trim();
    return first && first.length > 5 ? first.substring(0, 80) : 'Decision';
  }

  extractTask(text) {
    const verbs = ['prepare', 'send', 'review', 'coordinate', 'handle', 'create', 'siapkan', 'kirim', 'tinjau', '准备', '发送', '审查'];
    const lower = text.toLowerCase();
    for (const verb of verbs) {
      const idx = lower.indexOf(verb);
      if (idx !== -1) return text.substring(idx).replace(/[.!?。！？]$/, '').trim();
    }
    return text;
  }

  extractPIC(text) {
    const match = text.match(/([A-Z][a-z]{2,})(?:,|\s+will|\s+tolong|\s+请)/);
    return match ? match[1] : null;
  }

  extractDeadline(text) {
    const datePatterns = [
      /\d{1,2}\s+\w+\s+\d{4}/,
      /\d{2}\/\d{2}\/\d{4}/,
      /\d{4}-\d{2}-\d{2}/
    ];
    for (const p of datePatterns) {
      const m = text.match(p);
      if (m) return m[0];
    }
    
    const relatives = [
      ['tomorrow', 'Tomorrow'], ['besok', 'Tomorrow'], ['明天', 'Tomorrow'],
      ['next week', 'Next week'], ['minggu depan', 'Next week'], ['下周', 'Next week'],
      ['next monday', 'Next Monday'], ['星期一', 'Next Monday']
    ];
    const lower = text.toLowerCase();
    for (const [pattern, label] of relatives) {
      if (lower.includes(pattern)) return label;
    }
    return null;
  }

  deduplicate(arr, keyPath) {
    const seen = new Set();
    return arr.filter(item => {
      const val = keyPath.split('.').reduce((o, k) => o?.[k], item);
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  }
}
