"use client"

import { MouseEvent, SetStateAction, Dispatch } from 'react'

import { CheckIcon } from './icons/CheckIcon'
import { LoaderIcon } from './icons/LoaderIcon'


interface TransactionsInfoModalProps {
    isOpen: boolean
    modalTitle: string
    steps: string[]
    currentStep: number
    closeModal: () => void
    setCurrentStep: Dispatch<SetStateAction<number>>
}


export const TransactionsInfoModal: React.FC<TransactionsInfoModalProps> = ({
    isOpen,
    modalTitle,
    steps,
    currentStep,
    closeModal,
}) => {
    const handleClose = () => {
        closeModal()
    }


    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            //closeModal()
        }
    }


    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>

            <div className="bg-background-light-xs border border-background-light rounded-2xl md:rounded-2xl rounded-b-none w-full max-w-md mx-4 max-h-[80vh] overflow-hidden p-4 pb-8 fixed bottom-0 md:static md:pb-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{modalTitle}</h2>

                    <button
                        onClick={handleClose}
                        className="text-2xl p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                <hr />

                <div className="mt-4 space-y-4">

                    {steps.map((step, idx) => {
                        const stepNum = idx + 1;
                        const stepText = step;

                        return (
                            <div key={stepText} className={`flex rounded-md mx-2 gap-4`}>
                                <div>
                                    <div className={`flex items-center justify-center text-xl rounded-full w-8 h-8 ${currentStep > stepNum ? "bg-background-light" : (currentStep == stepNum ? "bg-background-btn text-background" : "border")}`}>
                                        {currentStep < stepNum && (
                                            <></>
                                        )}

                                        {currentStep === stepNum && (
                                            <LoaderIcon />
                                        )}

                                        {currentStep > stepNum && (
                                            <CheckIcon />
                                        )}
                                    </div>
                                </div>
                                <div className="">
                                    <div className="text-foreground-light">Step {stepNum}</div>
                                    <div className={`${currentStep === stepNum ? "text-foreground" : ""} font-semibold`}>{stepText}</div>
                                </div>
                            </div>
                        );
                    })}

                </div>

            </div>
        </div>
    )
}
