import React, { useMemo, useRef, useState } from 'react';
import { Plus, Download, ClipboardList, CheckCircle, FileText, X } from './Icons';
import { formatDate, formatDateTime } from '../lib/locale';
import { PROJECT_CHILD_TEXT_MAX_LENGTH, createGatherSubmissionSummary } from '../lib/projectDomain';
import { useUI } from './UIContext';

export default function GatherView({ user, isAdmin, project, fields = [], submissions = [], isStopped, isOwner, actions, t }) {
  const { showToast, confirm } = useUI();
  const [newField, setNewField] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  
  // Submission Form State
  const [formData, setFormData] = useState({});
  const [submitterName, setSubmitterName] = useState(user?.displayName || '');
  const [isSubmittingGather, setIsSubmittingGather] = useState(false);
  const isSubmittingGatherRef = useRef(false);
  const [isCreatingGatherField, setIsCreatingGatherField] = useState(false);
  const isCreatingGatherFieldRef = useRef(false);
  const [pendingGatherFieldIds, setPendingGatherFieldIds] = useState([]);
  const pendingGatherFieldIdsRef = useRef(new Set());

  const submissionSummary = useMemo(
    () => createGatherSubmissionSummary(submissions, user, fields),
    [submissions, user, fields],
  );
  const readableSubmissions = submissionSummary.submissions;
  const mySubmission = submissionSummary.mySubmission;
  const responseCount = submissionSummary.submissionCount;
  const hasSubmitted = !!mySubmission;
  const canShowSubmissionCard = !isStopped || hasSubmitted;
  const fieldTypeOptions = [
    { value: 'text', label: t('fieldTypeText') },
    { value: 'number', label: t('fieldTypeNumber') },
    { value: 'date', label: t('fieldTypeDate') },
    { value: 'option', label: t('fieldTypeOption') },
  ];
  const hasOptionValues = newFieldOptions.split(/[,\n，]/).some((option) => option.trim());
  const canCreateField = newField.trim() && (newFieldType !== 'option' || hasOptionValues);

  const handleAddField = async (e) => {
    e.preventDefault();
    if (!canCreateField) return;
    if (isCreatingGatherFieldRef.current) return;

    isCreatingGatherFieldRef.current = true;
    setIsCreatingGatherField(true);
    try {
      await actions.handleCreateGatherField(project.id, newField.trim(), newFieldType, newFieldOptions);
      setNewField('');
      setNewFieldOptions('');
    } catch (error) {
      console.error(error);
      showToast(t('gatherActionFailed'), 'error');
    } finally {
      isCreatingGatherFieldRef.current = false;
      setIsCreatingGatherField(false);
    }
  };

  const handleDeleteField = async (fieldId) => {
    if (!fieldId) return;
    if (pendingGatherFieldIdsRef.current.has(fieldId)) return;

    pendingGatherFieldIdsRef.current.add(fieldId);
    setPendingGatherFieldIds([...pendingGatherFieldIdsRef.current]);
    try {
      await actions.handleDeleteGatherField(fieldId);
    } catch (error) {
      console.error(error);
      showToast(t('gatherActionFailed'), 'error');
    } finally {
      pendingGatherFieldIdsRef.current.delete(fieldId);
      setPendingGatherFieldIds([...pendingGatherFieldIdsRef.current]);
    }
  };

  const getFieldTypeLabel = (type) => fieldTypeOptions.find((option) => option.value === type)?.label || t('fieldTypeText');
  const setFieldValue = (fieldId, value) => setFormData((current) => ({ ...current, [fieldId]: value }));
  const renderFieldInput = (field) => {
    const fieldType = ['number', 'date', 'option'].includes(field.type) ? field.type : 'text';
    const value = formData[field.id] || '';
    if (fieldType === 'option') {
      return (
        <select
          value={value}
          onChange={e => setFieldValue(field.id, e.target.value)}
          className="app-input"
          aria-label={field.label}
          disabled={isSubmittingGather}
        >
          <option value="">{t('selectOption')}</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    if (fieldType === 'number') {
      return (
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => setFieldValue(field.id, e.target.value)}
          className="app-input"
          placeholder={t('enterField', { field: field.label })}
          disabled={isSubmittingGather}
        />
      );
    }

    if (fieldType === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={e => setFieldValue(field.id, e.target.value)}
          className="app-input"
          placeholder={t('enterField', { field: field.label })}
          disabled={isSubmittingGather}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={e => setFieldValue(field.id, e.target.value)}
        className="app-input"
        placeholder={t('enterField', { field: field.label })}
        disabled={isSubmittingGather}
      />
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmittingGatherRef.current) return;

    confirm({
        title: t('submit'),
        message: t('confirmSubmit'),
        confirmText: t('submit'),
        cancelText: t('cancel'),
        onConfirm: async () => {
             // Validation
             if(!submitterName.trim()) {
                 showToast(t('setGuestName'), 'error');
                 return;
             }
             if (isSubmittingGatherRef.current) return;

             isSubmittingGatherRef.current = true;
             setIsSubmittingGather(true);
             try {
                 await actions.handleSubmitGather(project.id, formData, submitterName);
                 showToast(t('submitSuccess'), 'success');
             } catch (error) {
                 showToast(t('errorWithMessage', { title: t('submitError'), message: error.message }), 'error');
             } finally {
                 isSubmittingGatherRef.current = false;
                 setIsSubmittingGather(false);
             }
        }
    });
  };

  const handleExport = () => {
    // Generate CSV
    const headers = [t('nameLabel'), t('submittedAtCsv'), ...fields.map(f => f.label)];
    const rows = readableSubmissions.map(s => {
        const date = formatDateTime(s.submittedAt, t).replace(/,/g, '');
        const values = fields.map(f => `"${(s.data[f.id] || '').replace(/"/g, '""')}"`);
        return [`"${s.name}"`, `"${date}"`, ...values].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.title || t('exportFile')}_gather.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Creator / Admin Section */}
      {(isOwner || isAdmin) && !isStopped && (
        <div className="app-card mb-6 animate-fade-in-up p-5 sm:p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-google-blue" />
            {t('addField')}
          </h3>
          <form onSubmit={handleAddField} aria-busy={isCreatingGatherField} className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
             <input 
                type="text" 
                value={newField} 
                onChange={(e) => setNewField(e.target.value)}
                placeholder={t('fieldLabel')}
                className="app-input flex-1"
                maxLength={PROJECT_CHILD_TEXT_MAX_LENGTH}
                disabled={isCreatingGatherField}
             />
             <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
                className="app-input"
                aria-label={t('fieldType')}
                disabled={isCreatingGatherField}
             >
                {fieldTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
             </select>
             <button type="submit" disabled={isCreatingGatherField || !canCreateField} className="app-button-primary">
                <Plus className="w-4 h-4" /> {isCreatingGatherField ? t('processing') : t('create')}
             </button>
             {newFieldType === 'option' && (
               <input
                 type="text"
                 value={newFieldOptions}
                 onChange={(e) => setNewFieldOptions(e.target.value)}
                 placeholder={t('fieldOptionsPlaceholder')}
                 aria-label={t('fieldOptions')}
                 className="app-input md:col-span-2"
                 disabled={isCreatingGatherField}
               />
             )}
          </form>
           {/* List of Fields */}
          <div className="flex flex-wrap gap-2">
              {fields.map(field => {
                const isFieldDeletePending = pendingGatherFieldIds.includes(field.id);
                return (
                  <div key={field.id} className="app-chip group">
                      <span className="font-medium text-m3-on-surface">{field.label}</span>
                      <span className="rounded-full bg-m3-surface-container-high px-2 py-0.5 text-[11px] text-m3-on-surface-variant">{getFieldTypeLabel(field.type)}</span>
                      {/* Allow delete */}
                      <button 
                        onClick={() => handleDeleteField(field.id)}
                        disabled={isFieldDeletePending}
                        aria-busy={isFieldDeletePending}
                        className="touch-target -my-2 -mr-2 inline-flex items-center justify-center rounded-full text-m3-on-surface-variant hover:text-google-red"
                        title={isFieldDeletePending ? t('processing') : t('deleteField')}
                      >
                          <X className="w-3 h-3" />
                      </button>
                  </div>
                );
              })}
              {fields.length === 0 && <span className="text-sm text-m3-on-surface-variant opacity-70 italic">{t('noFields')}</span>}
          </div>
        </div>
      )}

      {/* Submission Status for Owner */}
      {(isOwner || isAdmin) && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-normal flex items-center gap-2">
                    <FileText className="w-6 h-6 text-m3-secondary" />
                    {t('responses')}
                    <span className="bg-m3-secondary-container text-m3-on-secondary-container text-sm px-2 py-0.5 rounded-full">{responseCount}</span>
                </h3>
                <button onClick={handleExport} className="app-button-quiet text-google-blue hover:bg-google-blue/10">
                    <Download className="w-5 h-5" /> {t('exportCSV')}
                </button>
              </div>
              
              <div className="app-card overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-m3-surface-container-high text-m3-on-surface-variant font-medium">
                          <tr>
                              <th className="px-4 py-3 min-w-[120px]">{t('nameLabel')}</th>
                              {fields.map(f => <th key={f.id} className="px-4 py-3 min-w-[150px]">{f.label}</th>)}
                              <th className="px-4 py-3 w-[150px]">{t('timeLabel')}</th>
                          </tr>
                      </thead>
                      <tbody>
                          {readableSubmissions.map(s => (
                              <tr key={s.id || s.uid} className="border-t border-m3-outline/10 hover:bg-m3-surface-container/50">
                                  <td className="px-4 py-3 font-medium">{s.name}</td>
                                  {fields.map(f => (
                                      <td key={f.id} className="px-4 py-3 max-w-[200px] truncate" title={s.data[f.id]}>
                                          {s.data[f.id]}
                                      </td>
                                  ))}
                                  <td className="px-4 py-3 text-xs opacity-70">{formatDate(s.submittedAt, t)}</td>
                              </tr>
                          ))}
                          {responseCount === 0 && (
                              <tr><td colSpan={fields.length + 2} className="px-4 py-8 text-center opacity-50">{t('dbEmpty')}</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* User Submission View */}
      {isStopped && !hasSubmitted && !isOwner && !isAdmin && (
          <div className="app-card-quiet flex flex-col items-center p-12 text-center opacity-80">
              <ClipboardList className="w-12 h-12 mb-4 opacity-50" />
              <h3 className="text-xl font-medium">{t('paused')}</h3>
              <p>{t('verifyAccess')}</p>
          </div>
      )}

      {canShowSubmissionCard && (
          <div className="app-card animate-fade-in-up p-6 md:p-8" style={{ animationDelay: '0.2s' }}>
              {hasSubmitted ? (
                  <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-google-green mx-auto mb-4" />
                      <h2 className="text-2xl font-medium text-m3-on-surface mb-2">{t('submitSuccess')}</h2>
                      <p className="text-m3-on-surface-variant mb-8">{t('alreadySubmitted')}</p>
                      
                      {/* Show their submission */}
                      <div className="app-card-quiet mx-auto max-w-md p-6 text-left">
                          <h4 className="font-medium mb-4 pb-2 border-b border-m3-outline/10 text-m3-primary">{t('yourResponse')}</h4>
                          <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="opacity-70 font-medium">{t('nameLabel')}</span>
                                <span className="text-right">{mySubmission.name}</span>
                            </div>
                            {fields.map(f => (
                                <div key={f.id} className="flex justify-between text-sm group">
                                    <span className="opacity-70 group-hover:opacity-100 transition-opacity">{f.label}</span>
                                    <span className="font-medium text-right">{mySubmission.data[f.id] || '-'}</span>
                                </div>
                            ))}
                            <div className="border-t border-m3-outline/10 pt-3 text-xs text-center opacity-50">
                                {t('submittedOn', { date: formatDateTime(mySubmission.submittedAt, t) })}
                            </div>
                          </div>
                      </div>
                  </div>
              ) : (
                <form onSubmit={handleSubmit} aria-busy={isSubmittingGather} className="max-w-lg mx-auto">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-full bg-google-blue/10 flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-google-blue" />
                        </div>
                        <h2 className="text-2xl font-medium">{t('fillForm')}</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="app-label">{t('nameNickname')}</label>
                            <input 
                                required
                                type="text" 
                                value={submitterName}
                                onChange={e => setSubmitterName(e.target.value)}
                                className="app-input"
                                placeholder={t('guestName')}
                                disabled={isSubmittingGather}
                            />
                        </div>

                        {fields.map(field => (
                            <div key={field.id}>
                                 <label className="app-label">{field.label}</label>
                                 {renderFieldInput(field)}
                            </div>
                        ))}

                        {fields.length === 0 && (
                            <div className="text-center py-6 text-m3-on-surface-variant opacity-70 bg-m3-surface-container rounded-lg border border-dashed border-m3-outline">
                                {t('noFields')}
                            </div>
                        )}
                        
                        {fields.length > 0 && (
                            <button type="submit" disabled={isSubmittingGather} className="app-button-primary mt-4 w-full text-lg">
                                {isSubmittingGather ? t('processing') : t('submit')}
                            </button>
                        )}
                    </div>
                </form>
              )}
          </div>
      )}
    </div>
  );
}
